import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { PickyState } from '@/lib/types';

const MB = 1024 * 1024;

// The "morning" notification after a (simulated) night of curation; tapping it opens Your call.
export async function scheduleNightNotification(state: PickyState) {
  if (Platform.OS === 'web') return;
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return;
  const photos = Object.values(state.photosById);
  const binnedMb =
    photos.filter((p) => p.status === 'binned' && !p.deleted).reduce((n, p) => n + (p.sizeBytes ?? 0), 0) / MB;
  const asks = state.review ? state.review.total - state.review.index : 0;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `Picky tidied ${photos.length} photos`,
      body: asks > 0 ? `${asks} need your call · Free up ${Math.round(binnedMb)} MB` : `Free up ${Math.round(binnedMb)} MB`,
      data: { screen: 'review' },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 5 },
  });
}
