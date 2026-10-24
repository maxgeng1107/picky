// SDK 58 keeps these album APIs under /legacy (not the new Asset-class API).
import * as Media from 'expo-media-library/legacy';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { Photo, Scene } from './types';

export async function readDemoAlbum(): Promise<{ photos: Photo[]; scenes: Scene[] }> {
  const permission = await Media.requestPermissionsAsync(false, ['photo']);
  if (!permission.granted || permission.accessPrivileges === 'limited') throw new Error('Allow full photo access to read the Picky Demo album.');
  const album = await Media.getAlbumAsync('Picky Demo');
  if (!album) throw new Error('Create an album named Picky Demo and add portrait photos first.');
  let after: string | undefined;
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay); endOfDay.setDate(endOfDay.getDate() + 1);
  const assets: Media.Asset[] = [];
  do {
    const page = await Media.getAssetsAsync({ album, first: 100, after, createdAfter: startOfDay, createdBefore: endOfDay,
      mediaType: Media.MediaType.photo, sortBy: [Media.SortBy.creationTime] });
    assets.push(...page.assets); after = page.hasNextPage ? page.endCursor : undefined;
    if (assets.length > 120) throw new Error('This demo supports at most 120 photos per run. Use a smaller Picky Demo album.');
  } while (after);
  if (!assets.length) throw new Error('Picky Demo contains no photos taken today.');
  assets.sort((a, b) => a.creationTime - b.creationTime);
  const photos: Photo[] = []; const scenes: Scene[] = [];
  for (let i = 0; i < assets.length; i++) {
    const a = assets[i];
    if (i === 0 || a.creationTime - assets[i - 1].creationTime > 5 * 60_000) {
      scenes.push({ id: `scene-${a.id}`, label: `Scene ${scenes.length + 1}`, photoIds: [], keptIds: [], genericKeptIds: [], uncertainIds: [], reviewed: false });
    }
    const scene = scenes[scenes.length - 1]; scene.photoIds.push(a.id);
    const info = await Media.getAssetInfoAsync(a, { shouldDownloadFromNetwork: true });
    if (!info.localUri) throw new Error('A photo is not available locally. Download it from iCloud and retry.');
    photos.push({ id: a.id, uri: info.localUri, localUri: info.localUri, takenAt: a.creationTime, sceneId: scene.id, status: 'kept' });
  }
  return { photos, scenes };
}
export async function encodePhoto(photo: Photo): Promise<{ id: string; imageBase64: string }> {
  const context = ImageManipulator.manipulate(photo.localUri ?? photo.uri);
  const original = await context.renderAsync();
  // Preserve detail without upscaling: fit the LONG edge to 1568, not a 512px thumbnail.
  const scale = Math.min(1, 1568 / Math.max(original.width, original.height));
  context.resize({ width: Math.round(original.width * scale), height: Math.round(original.height * scale) });
  const rendered = await context.renderAsync();
  const encoded = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.9, base64: true });
  context.release(); original.release(); rendered.release();
  if (!encoded.base64) throw new Error('Could not encode photo.');
  return { id: photo.id, imageBase64: encoded.base64 };
}
