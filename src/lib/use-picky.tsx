import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Alert, AppState, Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import { selectScene } from './api';
import { cancelNotification, scheduleIdleNotification, scheduleNightNotification } from './notify';
import { IDLE_MINUTES, loadTodaysScenes, onLibraryChange, peekTodaysPhotos, toBase64 } from './photos';
import { advance, applyAnswer, applyRescue, emptyProfile } from './taste';
import { beginCuration, decodePreferences, encodePreferences, initialState, recoverPreferences } from './preferences';
import { acceptSceneScores } from './scoring';
import type { PickyActions, PickyContextValue, PickyState } from './types';

const Context = createContext<PickyContextValue | null>(null);
const profileFile = () => new File(Paths.document, 'picky-preferences-v2.json');
const backupFile = () => new File(Paths.document, 'picky-preferences-v2-backup.json');
const readSaved = (file: File) => { try { return file.exists ? file.textSync() : undefined; } catch { return undefined; } };
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);
export function PickyProvider({ children }: { children: ReactNode }) {
  const [boot] = useState(() => {
    try {
      if (Platform.OS !== 'web' && (profileFile().exists || backupFile().exists)) {
        const restored = recoverPreferences(readSaved(profileFile()), readSaved(backupFile()));
        return { ...restored, error: restored.recovered ? 'Recovered the previous preference snapshot.' : undefined };
      }
    } catch { return { profile: emptyProfile(), lastCuratedAt: 0, processedIds: [] as string[], error: 'Saved preferences could not be loaded. A new profile is active.' }; }
    return { profile: emptyProfile(), lastCuratedAt: 0, processedIds: [] as string[], error: undefined };
  });
  const [state, setState] = useState<PickyState>(() => ({ ...initialState(boot.profile), error: boot.error }));
  const current = useRef(state); const running = useRef(false); const revision = useRef(0);
  const lastCuratedAt = useRef(boot.lastCuratedAt); const processedIds = useRef(new Set(boot.processedIds));
  const idleNotificationId = useRef<string | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const checkRef = useRef<() => Promise<void>>(async () => {});
  const commit = useCallback((next: PickyState) => { current.current = next; setState(next); }, []);
  const cancelRun = useCallback(() => { revision.current++; }, []);
  const save = useCallback((next: PickyState, clearBackup = false) => {
    try {
      if (Platform.OS !== 'web') {
        const file = profileFile(); const previous = readSaved(file);
        let previousValid = false;
        if (previous) { try { decodePreferences(previous); previousValid = true; } catch { /* Preserve a valid backup over corrupt primary data. */ } }
        const encoded = encodePreferences(next.profile, lastCuratedAt.current, [...processedIds.current]);
        if (clearBackup || previousValid) {
          const backup = backupFile(); if (!backup.exists) backup.create();
          backup.writeSync(clearBackup ? encoded : previous!);
        }
        if (!file.exists) file.create();
        file.writeSync(encoded);
      }
    } catch { next = { ...next, error: 'Preferences changed in memory but could not be saved to this device.' }; }
    commit(next);
  }, [commit]);
  const loadAlbum = useCallback(async () => {
    if (running.current) return;
    running.current = true; const version = revision.current;
    commit({ ...current.current, busy: true, status: 'Reading today’s photos…', error: undefined });
    try {
      const loaded = await loadTodaysScenes();
      if (version !== revision.current) return;
      commit({ ...beginCuration(current.current, loaded), busy: false, status: undefined });
    } catch (error) {
      if (version === revision.current) commit({ ...current.current, busy: false, status: undefined, error: errorText(error) });
    } finally { running.current = false; }
  }, [commit]);
  const simulateNight = useCallback(async () => {
    if (running.current) return;
    running.current = true; const version = revision.current;
    commit({ ...current.current, busy: true, status: 'Reading today’s photos…', error: undefined });
    try {
      const loaded = await loadTodaysScenes();
      if (version !== revision.current) return;
      if (idleTimer.current) clearTimeout(idleTimer.current);
      await cancelNotification(idleNotificationId.current); idleNotificationId.current = null;
      let next = beginCuration(current.current, loaded);
      for (let i = 0; i < next.scenes.length; i++) {
        if (version !== revision.current) return;
        const scene = next.scenes[i];
        commit({ ...next, status: `Looking at scene ${i + 1} of ${next.scenes.length}…` });
        const photos = [];
        for (const id of scene.photoIds) photos.push({ id, imageBase64: await toBase64(next.photosById[id].uri) });
        if (version !== revision.current) return;
        const result = await selectScene(scene.id, photos);
        next = acceptSceneScores(next, scene.id, result);
      }
      if (version !== revision.current) return;
      next = advance({ ...next, scenes: next.scenes.filter((s) => s.photoIds.length) }, 0);
      next = { ...next, busy: false, status: undefined, watch: undefined,
        error: next.scenes.length ? undefined : 'No single-person portrait photos were found. Originals remain in your album.' };
      // Only successful runs advance the checkpoint; reset cancels all late results.
      lastCuratedAt.current = Math.max(0, ...Object.values(loaded.photosById).map((p) => p.takenAt));
      processedIds.current = new Set([...processedIds.current, ...Object.keys(loaded.photosById)].slice(-600));
      save(next);
      try { await scheduleNightNotification(next, () => version === revision.current); } catch { /* Notification failure cannot discard preferences. */ }
    } catch (error) {
      if (version === revision.current) commit({ ...current.current, busy: false, status: undefined, error: errorText(error) });
    } finally { running.current = false; }
  }, [commit, save]);
  const checkForNewPhotos = useCallback(async () => {
    if (Platform.OS === 'web' || running.current) return;
    const version = revision.current;
    try {
      const fresh = (await peekTodaysPhotos()).filter((p) => !processedIds.current.has(p.id));
      if (version !== revision.current || running.current) return;
      if (idleTimer.current) clearTimeout(idleTimer.current);
      if (!fresh.length) { if (current.current.watch) commit({ ...current.current, watch: undefined }); return; }
      const lastPhotoAt = Math.max(...fresh.map((p) => p.takenAt));
      const readyAt = lastPhotoAt + IDLE_MINUTES * 60_000;
      commit({ ...current.current, watch: { newPhotos: fresh.length, lastPhotoAt, readyAt } });
      if (Date.now() >= readyAt) { await simulateNight(); return; }
      idleNotificationId.current = await scheduleIdleNotification(readyAt, fresh.length, idleNotificationId.current);
      if (version !== revision.current) { await cancelNotification(idleNotificationId.current); return; }
      idleTimer.current = setTimeout(() => void checkRef.current(), Math.max(0, readyAt - Date.now() + 500));
    } catch (error) { if (version === revision.current) commit({ ...current.current, error: errorText(error) }); }
  }, [commit, simulateNight]);
  useEffect(() => { checkRef.current = checkForNewPhotos; }, [checkForNewPhotos]);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    void checkRef.current();
    const app = AppState.addEventListener('change', (value) => { if (value === 'active') void checkRef.current(); });
    const library = onLibraryChange(() => void checkRef.current());
    return () => { cancelRun(); app.remove(); library.remove(); if (idleTimer.current) clearTimeout(idleTimer.current); };
  }, [cancelRun]);
  const actions = useMemo<PickyActions>(() => ({
    loadAlbum, simulateNight, curateNextScene: async () => { if (!running.current) commit(advance(current.current, current.current.review?.index ?? 0)); },
    answer: async (answer, expected) => { if (!running.current) save(applyAnswer(current.current, answer, expected)); },
    freeUpSpace: async () => { Alert.alert('Originals preserved', 'Cloud backup is not connected. All original photos remain on your phone; deletion is disabled.'); },
    rescue: (id) => { if (!running.current) save(applyRescue(current.current, id)); },
    reset: () => {
      cancelRun(); lastCuratedAt.current = 0; processedIds.current.clear();
      if (idleTimer.current) clearTimeout(idleTimer.current);
      void cancelNotification(idleNotificationId.current).catch(() => {}); idleNotificationId.current = null;
      save(initialState(), true);
    },
  }), [loadAlbum, simulateNight, commit, save, cancelRun]);
  return <Context.Provider value={{ state, actions }}>{children}</Context.Provider>;
}
export function usePicky(): PickyContextValue {
  const value = useContext(Context);
  if (!value) throw new Error('usePicky must be used inside PickyProvider');
  return value;
}
