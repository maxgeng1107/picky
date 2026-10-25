import type { Photo } from './types';
export interface BackupReceipt { photoId: string; driveFileId: string; verified: true }
export async function backupThenDelete(photos: Photo[], dependencies: {
  backup: (photo: Photo) => Promise<BackupReceipt>;
  remove: (ids: string[]) => Promise<boolean>;
  isCurrent: () => boolean;
  onBackedUp?: (photo: Photo, receipt: BackupReceipt) => void;
}) {
  const confirmed: { photo: Photo; receipt: BackupReceipt }[] = []; const failed: string[] = [];
  for (const photo of photos) {
    if (!dependencies.isCurrent()) return { confirmed, failed, deleted: [] as string[], cancelled: true };
    try {
      const receipt = await dependencies.backup(photo);
      if (receipt?.verified !== true || receipt.photoId !== photo.id || typeof receipt.driveFileId !== 'string' || !receipt.driveFileId)
        throw new Error('Unverified backup.');
      if (dependencies.isCurrent()) dependencies.onBackedUp?.(photo, receipt);
      confirmed.push({ photo, receipt });
    } catch { failed.push(photo.id); }
  }
  if (!dependencies.isCurrent()) return { confirmed, failed, deleted: [] as string[], cancelled: true };
  const ids = confirmed.map((x) => x.photo.id);
  const deleted = ids.length && await dependencies.remove(ids) ? ids : [];
  return { confirmed, failed, deleted, cancelled: false };
}
