import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Alert, AppState, Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import { isDriveConfigured, selectScene, uploadToDrive } from './api';
import { backupThenDelete } from './backup';
import { cancelNotification, scheduleIdleNotification, scheduleNightNotification } from './notify';
import { IDLE_MINUTES, loadTodaysScenes, onLibraryChange, peekTodaysPhotos, toBase64, toFullJpegBase64, deleteFromPhone } from './photos';
import { advance, applyAnswer, applyRescue, emptyProfile, withHistory } from './taste';
import { beginCuration, decodePreferences, encodePreferences, initialState, recoverPreferences } from './preferences';
import { scoreCurationScenes } from './curation';
import type { PickyActions, PickyContextValue, PickyState } from './types';

const Context = createContext<PickyContextValue | null>(null);
const profileFile = () => new File(Paths.document, 'picky-counter-preferences-v1.json');
const backupFile = () => new File(Paths.document, 'picky-counter-preferences-v1-backup.json');
const readSaved = (file: File) => { try { return file.exists ? file.textSync() : undefined; } catch { return undefined; } };
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);
export function PickyProvider({ children }: { children: ReactNode }) {
  const [boot] = useState(() => {
    try {
      if (Platform.OS !== 'web' && (profileFile().exists || backupFile().exists)) {
        const restored = recoverPreferences(readSaved(profileFile()), readSaved(backupFile()));
        if (restored.profile.preference) throw new Error('Experimental model is not a counter snapshot.');
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
      let prepared: { sceneId: string; photos: { id: string; imageBase64: string }[] } | undefined;
      const scored = await scoreCurationScenes(next, {
        isCurrent: () => version === revision.current,
        progress: (done, total) => { if (version === revision.current) commit({ ...current.current, status: `Looked at ${done} of ${total} scenes…` }); },
        observe: async (scene) => {
          if (prepared?.sceneId !== scene.id) {
            const photos = [];
            for (const id of scene.photoIds) photos.push({ id, imageBase64: await toBase64(next.photosById[id].uri) });
            prepared = { sceneId: scene.id, photos };
          }
          if (version !== revision.current) throw new Error('Curation cancelled.');
          return selectScene(scene.id, prepared.photos);
        },
      });
      if (scored.cancelled) return;
      next = scored.state;
      if (version !== revision.current) return;
      next = advance({ ...next, scenes: next.scenes.filter((s) => s.photoIds.length) }, 0);
      next = { ...next, busy: false, status: undefined, watch: undefined, profileHistory: [next.profile],
        error: scored.failedCount ? `${scored.failedCount} scene(s) could not be scored. Their originals remain untouched and can be retried.` : next.scenes.length ? undefined : 'No single-person portrait photos were found. Originals remain in your album.' };
      // Failed scenes never advance their checkpoint; reset cancels all late results.
      lastCuratedAt.current = Math.max(lastCuratedAt.current, ...scored.processedIds.map((id) => loaded.photosById[id].takenAt));
      processedIds.current = new Set([...processedIds.current, ...scored.processedIds].slice(-600));
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
  const freeUpSpace = useCallback(async () => {
    if (running.current) return;
    const binned = Object.values(current.current.photosById).filter((p) => p.status === 'binned' && !p.deleted);
    if (!binned.length) return;
    running.current = true; const version = revision.current;
    commit({ ...current.current, busy: true, status: 'Checking Drive backup…', error: undefined });
    try {
      const configured = await isDriveConfigured();
      if (version !== revision.current) return;
      if (!configured) {
        // No Drive: only with an explicit confirmation, and iOS still keeps them in Recently Deleted for 30 days.
        const ok = await new Promise<boolean>((resolve) => Alert.alert('Free up space',
          `Google Drive isn't connected. Delete the ${binned.length} photos Picky didn't keep? iOS keeps them in Recently Deleted for 30 days.`,
          [{ text: 'Cancel', style: 'cancel', onPress: () => resolve(false) }, { text: 'Delete', style: 'destructive', onPress: () => resolve(true) }]));
        if (version !== revision.current) return;
        if (!ok || !(await deleteFromPhone(binned.map((p) => p.id)))) { commit({ ...current.current, busy: false, status: undefined }); return; }
        const photosById = { ...current.current.photosById }; let freed = 0;
        for (const p of binned) { freed += photosById[p.id]?.sizeBytes ?? 0; photosById[p.id] = { ...photosById[p.id], deleted: true }; }
        commit({ ...current.current, photosById, freedBytes: current.current.freedBytes + freed, busy: false, status: undefined });
        return;
      }
      const confirmed = await new Promise<boolean>((resolve) => Alert.alert('Back up JPEG copies & free space',
        `Upload JPEG copies of ${binned.length} photos to the configured Google Drive account, then remove only verified copies from this phone? JPEG copies do not preserve original HEIC format or Live Photo motion; original metadata is not guaranteed.`,
        [{ text: 'Cancel', style: 'cancel', onPress: () => resolve(false) }, { text: 'Back up & delete', style: 'destructive', onPress: () => resolve(true) }]));
      if (version !== revision.current) return;
      if (!confirmed) { commit({ ...current.current, busy: false, status: undefined }); return; }
      let index = 0;
      const result = await backupThenDelete(binned, {
        isCurrent: () => version === revision.current,
        backup: async (photo) => {
          commit({ ...current.current, status: `Backing up ${++index} of ${binned.length}…` });
          return uploadToDrive(photo.id, `picky-${photo.takenAt}.jpg`, await toFullJpegBase64(photo.uri));
        },
        onBackedUp: (photo, receipt) => commit({ ...current.current, photosById: { ...current.current.photosById,
          [photo.id]: { ...current.current.photosById[photo.id], driveFileId: receipt.driveFileId } } }),
        remove: deleteFromPhone,
      });
      if (version !== revision.current) return;
      const photosById = { ...current.current.photosById }; let freed = 0;
      for (const id of result.deleted) { freed += photosById[id].sizeBytes ?? 0; photosById[id] = { ...photosById[id], deleted: true }; }
      commit({ ...current.current, photosById, freedBytes: current.current.freedBytes + freed, busy: false, status: undefined,
        error: result.failed.length ? `${result.failed.length} backups failed. Their originals remain on this phone.` : undefined });
    } catch (error) {
      if (version === revision.current) commit({ ...current.current, busy: false, status: undefined, error: errorText(error) });
    } finally { running.current = false; }
  }, [commit]);
  const actions = useMemo<PickyActions>(() => ({
    loadAlbum, simulateNight, curateNextScene: async () => { if (!running.current) commit(advance(current.current, current.current.review?.index ?? 0)); },
    answer: async (answer, expected) => { if (!running.current) save(withHistory(current.current, applyAnswer(current.current, answer, expected))); },
    setMyPick: (sceneId, photoId) => {
      if (running.current || !current.current.scenes.some((s) => s.id === sceneId && s.photoIds.includes(photoId))) return;
      const myPicks = { ...current.current.myPicks };
      if (myPicks[sceneId] === photoId) delete myPicks[sceneId];
      else myPicks[sceneId] = photoId;
      commit({ ...current.current, myPicks });
    },
    freeUpSpace,
    rescue: (id) => { if (!running.current) save(applyRescue(current.current, id)); },
    reset: () => {
      cancelRun(); lastCuratedAt.current = 0; processedIds.current.clear();
      if (idleTimer.current) clearTimeout(idleTimer.current);
      void cancelNotification(idleNotificationId.current).catch(() => {}); idleNotificationId.current = null;
      save({ ...initialState(), freedBytes: current.current.freedBytes }, true);
    },
  }), [loadAlbum, simulateNight, commit, save, cancelRun, freeUpSpace]);
  return <Context.Provider value={{ state, actions }}>{children}</Context.Provider>;
}
export function usePicky(): PickyContextValue {
  const value = useContext(Context);
  if (!value) throw new Error('usePicky must be used inside PickyProvider');
  return value;
}
