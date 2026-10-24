import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { PickyState } from '@/lib/types';

// Fires when the shoot looks over (no new photo for IDLE_MINUTES) while Picky is in the background.
// Re-armed every time a new photo shows up, so only the last one ever fires.
export async function scheduleIdleNotification(readyAt: number, newPhotos: number, previousId: string | null) {
  if (Platform.OS === 'web') return null;
  if (previousId) await Notifications.cancelScheduledNotificationAsync(previousId).catch(() => {});
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return null;
  return Notifications.scheduleNotificationAsync({
    content: {
      title: 'Done shooting?',
      body: `${newPhotos} new photos · Open Picky to prepare suggestions. Originals remain on your phone.`,
      data: { screen: 'review' },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: readyAt },
  });
}

export async function cancelNotification(id: string | null) {
  if (Platform.OS === 'web' || !id) return;
  await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
}

// Sent right after curation; tapping it opens Your call.
export async function scheduleNightNotification(state: PickyState, shouldContinue = () => true) {
  if (Platform.OS === 'web') return;
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return;
  if (!shouldContinue()) return;
  const photos = Object.values(state.photosById);
  const asks = state.review ? state.review.total - state.review.index : 0;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `Picky prepared suggestions for ${photos.length} photos`,
      body: asks > 0 ? `${asks} comparisons to review · Originals remain on your phone` : 'Suggestions ready · Originals remain on your phone',
      data: { screen: 'review' },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 5 },
  });
}
