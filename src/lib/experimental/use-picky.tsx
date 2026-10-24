import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { Alert, Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Notifications from 'expo-notifications';
import { initialState, startReview, answerReview } from './engine';
import { emptyModel, profileFor, restoreModel } from './taste';
import { readDemoAlbum, encodePhoto } from './photos';
import { fetchScores } from './api';
import type { PickyActions, PickyContextValue, PickyState } from './types';

const Context = createContext<PickyContextValue | null>(null);
const profileFile = () => new File(Paths.document, 'picky-preferences-v1.json');
export function PickyProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PickyState>(() => {
    try {
      if (Platform.OS !== 'web' && profileFile().exists) {
        const model = restoreModel(JSON.parse(profileFile().textSync()));
        return initialState(profileFor(model));
      }
    } catch { return { ...initialState(), error: 'Saved preferences could not be read; starting a new profile.' }; }
    return initialState();
  });
  const current = useRef(state); const running = useRef(false); const generation = useRef(0);
  const commit = useCallback((next: PickyState) => { current.current = next; setState(next); }, []);
  const save = useCallback((next: PickyState) => {
    try {
      if (Platform.OS !== 'web') {
        const file = profileFile(); if (!file.exists) file.create();
        file.writeSync(JSON.stringify(next.profile.preference));
      }
    } catch { next = { ...next, error: 'Preference changed in memory but could not be saved.' }; }
    commit(next);
  }, [commit]);
  const simulateNight = useCallback(async () => {
    if (running.current) return;
    running.current = true; const revision = generation.current;
    commit({ ...current.current, busy: true, error: undefined });
    try {
      if (Platform.OS === 'web') throw new Error('Real photo access requires the iPhone app.');
      const { photos, scenes } = await readDemoAlbum();
      for (const scene of scenes) {
        // Fixed anchors permit chunking without forcing batch-relative scores.
        for (let offset = 0; offset < scene.photoIds.length; offset += 8) {
          if (generation.current !== revision) return;
          const members = photos.filter((p) => scene.photoIds.slice(offset, offset + 8).includes(p.id));
          const images = []; for (const photo of members) images.push(await encodePhoto(photo));
          const result = await fetchScores(scene.id, images);
          for (const photo of members) { photo.scores = result.scores[photo.id]; photo.gated = result.gated.includes(photo.id); }
        }
      }
      if (generation.current !== revision) return;
      const next = startReview(photos, scenes, current.current.profile); commit(next);
      try {
        const permission = await Notifications.requestPermissionsAsync();
        if (generation.current === revision && permission.granted) await Notifications.scheduleNotificationAsync({
          content: { title: 'Picky prepared photo suggestions', body: `${next.review?.total ?? 0} comparisons to review. Originals remain on your phone.`, data: { screen: 'review' } },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 5 },
        });
      } catch { /* Notification failure must not discard curation or preferences. */ }
    } catch (error) {
      if (generation.current !== revision) return;
      const message = error instanceof Error ? error.message : 'Photo curation failed.';
      commit({ ...current.current, busy: false, error: message }); Alert.alert('Picky', message);
    } finally {
      running.current = false;
      if (generation.current === revision && current.current.busy) commit({ ...current.current, busy: false });
    }
  }, [commit]);
  const actions = useMemo<PickyActions>(() => ({
    loadAlbum: simulateNight, simulateNight, curateNextScene: simulateNight,
    answer: async (a) => { if (!running.current) save(answerReview(current.current, a)); },
    freeUpSpace: async () => { Alert.alert('Originals preserved', 'Cloud backup and deletion are not enabled in this version. No photos have been deleted.'); },
    rescue: () => { Alert.alert('Originals preserved', 'All original photos are still in your album.'); },
    reset: () => { generation.current++; save(initialState(profileFor(emptyModel()))); },
  }), [save, simulateNight]);
  return <Context.Provider value={{ state, actions }}>{children}</Context.Provider>;
}
export function usePicky(): PickyContextValue {
  const value = useContext(Context);
  if (!value) throw new Error('usePicky must be used inside PickyProvider');
  return value;
}
