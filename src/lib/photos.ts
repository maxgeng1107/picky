// Read today's photos from the "Picky Demo" album, split them into scenes, and shrink them for Claude.
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as MediaLibrary from 'expo-media-library/legacy';

import type { Photo, PhotoId, Scene } from '@/lib/types';

export const ALBUM_NAME = 'Picky Demo';
export const TODAY_ONLY = true; // set to false if the demo photos weren't shot today
export const SCENE_GAP_MIN = 5; // a gap longer than this starts a new scene
const MAX_PHOTOS_PER_SCENE = 12;

export async function loadTodaysScenes(): Promise<{ photosById: Record<PhotoId, Photo>; scenes: Scene[] }> {
  const perm = await MediaLibrary.requestPermissionsAsync();
  if (!perm.granted) throw new Error('Picky needs access to your photos (Settings → Expo Go → Photos → Full Access).');

  const album = await MediaLibrary.getAlbumAsync(ALBUM_NAME);
  if (!album) throw new Error(`No album called "${ALBUM_NAME}". Create it in Photos and add today's selfies.`);

  const page = await MediaLibrary.getAssetsAsync({
    album,
    mediaType: MediaLibrary.MediaType.photo,
    sortBy: [[MediaLibrary.SortBy.creationTime, true]],
    first: 300,
  });
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const assets = page.assets
    .filter((a) => !TODAY_ONLY || a.creationTime >= startOfToday.getTime())
    .sort((a, b) => a.creationTime - b.creationTime);
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

export async function deleteFromPhone(ids: PhotoId[]): Promise<boolean> {
  if (ids.length === 0) return true;
  return MediaLibrary.deleteAssetsAsync(ids);
}
