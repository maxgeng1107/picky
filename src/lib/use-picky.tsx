// The real usePicky(): today's photos from the "Picky Demo" album, scored by Claude via /api/select,
// curated and learned by the engine in taste.ts. Same shape as src/mock/picky-mock.tsx.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Alert } from 'react-native';

import { selectScene } from '@/lib/api';
import { scheduleNightNotification } from '@/lib/notify';
import { deleteFromPhone, loadTodaysScenes, toBase64 } from '@/lib/photos';
import { advance, applyAnswer, applyRescue, emptyProfile } from '@/lib/taste';
import type { PhotoId, PickyActions, PickyContextValue, PickyState } from '@/lib/types';

function initialState(): PickyState {
  return { photosById: {}, scenes: [], profile: emptyProfile(), review: null, busy: false, freedBytes: 0 };
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

// Score one scene with Claude and fold the result into the state (no picking yet).
async function scoreScene(state: PickyState, sceneId: string): Promise<PickyState> {
  const scene = state.scenes.find((s) => s.id === sceneId)!;
  const photos = await Promise.all(
    scene.photoIds.map(async (id) => ({ id, imageBase64: await toBase64(state.photosById[id].uri) })),
  );
  const result = await selectScene(sceneId, photos);
  const byId = new Map(result.photos.map((p) => [p.id, p]));
  const photosById = { ...state.photosById };
  const keepIds: PhotoId[] = [];
  for (const id of scene.photoIds) {
    const scored = byId.get(id);
    if (scored && !scored.person) {
      delete photosById[id]; // not a photo of a person: Picky never touches it
      continue;
    }
    keepIds.push(id);
    photosById[id] = { ...photosById[id], gated: scored?.gated ?? true, scores: scored?.scores };
  }
  return {
    ...state,
    photosById,
    scenes: state.scenes.map((s) => (s.id === sceneId ? { ...s, label: result.label, photoIds: keepIds } : s)),
  };
}

const PickyContext = createContext<PickyContextValue | null>(null);

export function PickyProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PickyState>(initialState);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const setBusy = (status?: string) => setState((s) => ({ ...s, busy: !!status, status, error: undefined }));

  const loadAlbum = useCallback(async () => {
    setBusy('Reading today’s photos…');
    try {
      const { photosById, scenes } = await loadTodaysScenes();
      setState({ ...initialState(), photosById, scenes, freedBytes: stateRef.current.freedBytes });
    } catch (e) {
      setState((s) => ({ ...s, busy: false, status: undefined, error: errorText(e) }));
    }
  }, []);

  const simulateNight = useCallback(async () => {
    setBusy('Reading today’s photos…');
    try {
      const loaded = await loadTodaysScenes();
      let next: PickyState = { ...initialState(), ...loaded, freedBytes: stateRef.current.freedBytes, busy: true };
      setState({ ...next, status: `Looking at ${next.scenes.length} scenes…` });
      // score all scenes in parallel; one Claude call per scene
      const scored = await Promise.all(next.scenes.map((s) => scoreScene(next, s.id)));
      for (const [i, s] of next.scenes.entries()) {
        const sceneState = scored[i];
        const scene = sceneState.scenes.find((x) => x.id === s.id)!;
        const photosById = { ...next.photosById };
        for (const id of s.photoIds) {
          if (sceneState.photosById[id]) photosById[id] = sceneState.photosById[id];
          else delete photosById[id];
        }
        next = { ...next, photosById, scenes: next.scenes.map((x) => (x.id === s.id ? scene : x)) };
      }
      next = { ...next, scenes: next.scenes.filter((s) => s.photoIds.length > 0) };
      const curated = { ...advance(next, 0), busy: false, status: undefined };
      setState(curated);
      await scheduleNightNotification(curated);
    } catch (e) {
      setState((s) => ({ ...s, busy: false, status: undefined, error: errorText(e) }));
    }
  }, []);

  const freeUpSpace = useCallback(async () => {
    const binned = Object.values(stateRef.current.photosById).filter((p) => p.status === 'binned' && !p.deleted);
    if (binned.length === 0) return;
    const ok = await new Promise<boolean>((resolve) =>
      Alert.alert(
        'Free up space',
        `Delete ${binned.length} photos Picky didn't keep? They stay in Recently Deleted for 30 days. (Drive backup isn't connected in this demo.)`,
        [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
        ],
      ),
    );
    if (!ok) return;
    try {
      const deleted = await deleteFromPhone(binned.map((p) => p.id));
      if (!deleted) return;
      setState((s) => {
        let freed = 0;
        const photosById = { ...s.photosById };
        for (const p of binned) {
          freed += p.sizeBytes ?? 0;
          photosById[p.id] = { ...photosById[p.id], deleted: true };
        }
        return { ...s, photosById, freedBytes: s.freedBytes + freed };
      });
    } catch (e) {
      setState((s) => ({ ...s, error: errorText(e) }));
    }
  }, []);

  const actions = useMemo<PickyActions>(
    () => ({
      loadAlbum,
      curateNextScene: async () => setState((s) => advance(s, s.review?.index ?? 0)),
      simulateNight,
      answer: async (a) => setState((s) => applyAnswer(s, a)),
      freeUpSpace,
      rescue: (id) => setState((s) => applyRescue(s, id)),
      reset: () => setState((s) => ({ ...initialState(), freedBytes: s.freedBytes })),
    }),
    [loadAlbum, simulateNight, freeUpSpace],
  );

  const value = useMemo(() => ({ state, actions }), [state, actions]);
  return <PickyContext.Provider value={value}>{children}</PickyContext.Provider>;
}

export function usePicky(): PickyContextValue {
  const ctx = useContext(PickyContext);
  if (!ctx) throw new Error('usePicky must be used inside <PickyProvider>');
  return ctx;
}
