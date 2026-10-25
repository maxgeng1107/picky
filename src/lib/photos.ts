// Read today's photos from the "Picky Demo" album, split them into scenes, and shrink them for Claude.
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as MediaLibrary from 'expo-media-library/legacy';

import type { Photo, PhotoId, Scene } from '@/lib/types';

export const ALBUM_NAME = 'Picky Demo';
export const TODAY_ONLY = true; // set to false if the demo photos weren't shot today
export const SCENE_GAP_MIN = 5; // a gap longer than this starts a new scene
// No new photo for this long = the shoot is over, so Picky curates. Product: 60. Demo default: 1.
export const IDLE_MINUTES = Number(process.env.EXPO_PUBLIC_IDLE_MINUTES ?? 1);
const MAX_PHOTOS_PER_SCENE = 12;

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// Cheap check used for auto-detect: capture times of today's photos in the whole camera roll
// (the Camera app saves to Recents, never to a custom album).
export async function peekTodaysPhotoTimes(): Promise<number[]> {
  const perm = await MediaLibrary.requestPermissionsAsync();
  if (!perm.granted) return [];
  const page = await MediaLibrary.getAssetsAsync({
    mediaType: MediaLibrary.MediaType.photo,
    createdAfter: startOfToday(),
    sortBy: [[MediaLibrary.SortBy.creationTime, false]],
    first: 300,
  });
  return page.assets.map((a) => a.creationTime);
}

// Put today's photos from the camera roll into the "Picky Demo" album (creating it if needed),
// so the album always shows what Picky looked at. On iOS this adds references; nothing is copied.
async function syncTodayIntoAlbum(): Promise<MediaLibrary.Album> {
  const today = await MediaLibrary.getAssetsAsync({
    mediaType: MediaLibrary.MediaType.photo,
    createdAfter: startOfToday(),
    sortBy: [[MediaLibrary.SortBy.creationTime, false]],
    first: 300,
  });
  let album = await MediaLibrary.getAlbumAsync(ALBUM_NAME);
  if (!album) {
    if (today.assets.length === 0) throw new Error('No photos taken today yet. Take a few selfies and try again.');
    album = await MediaLibrary.createAlbumAsync(ALBUM_NAME, today.assets[0], false);
  }
  const inAlbum = await MediaLibrary.getAssetsAsync({
    album,
    mediaType: MediaLibrary.MediaType.photo,
    createdAfter: startOfToday(),
    first: 300,
  });
  const already = new Set(inAlbum.assets.map((a) => a.id));
  const missing = today.assets.filter((a) => !already.has(a.id));
  if (missing.length > 0) await MediaLibrary.addAssetsToAlbumAsync(missing, album, false);
  return album;
}

export function onLibraryChange(listener: () => void) {
  return MediaLibrary.addListener(listener);
}

export async function loadTodaysScenes(): Promise<{ photosById: Record<PhotoId, Photo>; scenes: Scene[] }> {
  const perm = await MediaLibrary.requestPermissionsAsync();
  if (!perm.granted) throw new Error('Picky needs access to your photos (Settings → Expo Go → Photos → Full Access).');

  const createdAfter = TODAY_ONLY ? startOfToday() : undefined;

  // Photos without a person in them are still skipped later by the scoring step.
  const album = TODAY_ONLY ? await syncTodayIntoAlbum() : await MediaLibrary.getAlbumAsync(ALBUM_NAME);
  if (!album) throw new Error(`No album called "${ALBUM_NAME}".`);

  const page = await MediaLibrary.getAssetsAsync({
    album,
    mediaType: MediaLibrary.MediaType.photo,
    createdAfter,
    sortBy: [[MediaLibrary.SortBy.creationTime, false]],
    first: 300,
  });
  const assets = [...page.assets].sort((a, b) => a.creationTime - b.creationTime);
  if (assets.length === 0) {
    throw new Error(
      TODAY_ONLY ? `No photos taken today in "${ALBUM_NAME}".` : `The "${ALBUM_NAME}" album is empty.`,
    );
  }

  const photosById: Record<PhotoId, Photo> = {};
  const scenes: Scene[] = [];
  let current: Scene | null = null;
  let lastTime = 0;
  for (const asset of assets) {
    const info = await MediaLibrary.getAssetInfoAsync(asset);
    const newScene = !current || asset.creationTime - lastTime > SCENE_GAP_MIN * 60 * 1000;
    if (newScene || current!.photoIds.length >= MAX_PHOTOS_PER_SCENE) {
      current = {
        id: `scene-${scenes.length + 1}`,
        photoIds: [],
        keptIds: [],
        genericKeptIds: [],
        uncertainIds: [],
        reviewed: false,
      };
      scenes.push(current);
    }
    lastTime = asset.creationTime;
    photosById[asset.id] = {
      id: asset.id,
      uri: info.localUri ?? asset.uri,
      localUri: info.localUri,
      takenAt: asset.creationTime,
      // rough size of an iPhone photo on disk; the exact size isn't exposed here
      sizeBytes: Math.round(asset.width * asset.height * 0.3),
      sceneId: current!.id,
      status: 'kept',
    };
    current!.photoIds.push(asset.id);
  }
  return { photosById, scenes };
}

// ~512 px wide JPEG as base64 — small enough to send a whole scene to Claude in one request.
export async function toBase64(uri: string): Promise<string> {
  const image = await ImageManipulator.manipulate(uri).resize({ width: 512 }).renderAsync();
  const result = await image.saveAsync({ base64: true, compress: 0.7, format: SaveFormat.JPEG });
  if (!result.base64) throw new Error('Could not read a photo');
  return result.base64;
}

// Full-resolution JPEG for the Drive backup (HEIC photos are converted; Live Photo motion isn't kept).
export async function toFullJpegBase64(uri: string): Promise<string> {
  const image = await ImageManipulator.manipulate(uri).renderAsync();
  const result = await image.saveAsync({ base64: true, compress: 0.9, format: SaveFormat.JPEG });
  if (!result.base64) throw new Error('Could not read a photo');
  return result.base64;
}

export async function deleteFromPhone(ids: PhotoId[]): Promise<boolean> {
  if (ids.length === 0) return true;
  return MediaLibrary.deleteAssetsAsync(ids);
}
