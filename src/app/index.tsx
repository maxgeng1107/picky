import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { SceneCard } from '@/components/picky/scene-card';
import { Card, PickyButton, Screen } from '@/components/picky/ui';
import { ThemedText } from '@/components/themed-text';
import { Accent, formatMb } from '@/constants/picky';
import { Spacing } from '@/constants/theme';
import { usePicky } from '@/hooks/use-picky';

export default function TodayScreen() {
  const { state, actions } = usePicky();
  const photos = Object.values(state.photosById);
  const curated = state.scenes.filter((s) => s.keptIds.length > 0);
  const toFree = photos.filter((p) => p.status === 'binned' && !p.deleted).reduce((n, p) => n + (p.sizeBytes ?? 0), 0);
  const asks = state.review ? state.review.total - state.review.index : 0;

  const notice = state.error ? (
    <Card style={styles.error}>
      <ThemedText style={styles.errorText}>{state.error}</ThemedText>
    </Card>
  ) : state.busy && state.status ? (
    <ThemedText themeColor="textSecondary" style={styles.center}>
      {state.status}
    </ThemedText>
  ) : null;

  const watch =
    state.watch && !state.busy ? (
      <Card style={styles.watch}>
        <ThemedText style={styles.watchTitle}>📷 Picky noticed {state.watch.newPhotos} new photos</ThemedText>
        <ThemedText themeColor="textSecondary">
          It picks once you stop shooting — around {formatTime(state.watch.readyAt)}, if no new photo comes in.
        </ThemedText>
        <PickyButton label="Pick now" variant="outline" onPress={actions.simulateNight} />
      </Card>
    ) : null;

  if (curated.length === 0) {
    return (
      <Screen title="Picky" subtitle="As picky as you are.">
        {notice}
        {watch}
        <Card style={styles.empty}>
          <ThemedText style={styles.emptyTitle}>Nothing tidied yet</ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.center}>
            Just take photos. When you stop shooting, Picky keeps the ones you would keep, moves the rest to your
            Cloud Bin, and only pings you when it needs your call.
          </ThemedText>
          {!state.watch ? <PickyButton label="Pick now" onPress={actions.simulateNight} loading={state.busy} /> : null}
        </Card>
      </Screen>
    );
  }

  return (
    <Screen title="Today" subtitle="As picky as you are.">
      {notice}
      {watch}
      <Pressable onPress={() => asks > 0 && router.push('/review')}>
        <View style={styles.banner}>
          <ThemedText style={styles.bannerTitle}>Picky tidied {photos.length} photos</ThemedText>
          <ThemedText style={styles.bannerBody}>
            {asks > 0 ? `${asks} need your call → Review` : 'All caught up — see what Picky learned in Taste'}
          </ThemedText>
        </View>
      </Pressable>

      <Card style={styles.storage}>
        <View style={{ flex: 1 }}>
          <ThemedText type="small" themeColor="textSecondary">
            Freed so far
          </ThemedText>
          <ThemedText style={styles.freed}>{formatMb(state.freedBytes)}</ThemedText>
        </View>
        <PickyButton
          label={toFree > 0 ? `Free up ${formatMb(toFree)}` : 'Nothing to free'}
          onPress={actions.freeUpSpace}
          disabled={toFree === 0}
          loading={state.busy}
        />
      </Card>

      {curated.map((scene) => (
        <SceneCard key={scene.id} scene={scene} photosById={state.photosById} profile={state.profile} />
      ))}

      <PickyButton label="Pick again" variant="ghost" onPress={actions.simulateNight} />
    </Screen>
  );
}

function formatTime(ms: number) {
  const d = new Date(ms);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  watch: { borderWidth: 2, borderColor: Accent },
  watchTitle: { fontSize: 18, fontWeight: 700 },
  empty: { alignItems: 'center', paddingVertical: Spacing.five, gap: Spacing.three },
  emptyTitle: { fontSize: 22, fontWeight: 700 },
  center: { textAlign: 'center' },
  error: { backgroundColor: 'rgba(220, 38, 38, 0.15)' },
  errorText: { color: '#DC2626', fontWeight: 700 },
  banner: { backgroundColor: Accent, borderRadius: Spacing.four, padding: Spacing.three, gap: Spacing.one },
  bannerTitle: { color: '#fff', fontSize: 20, fontWeight: 800 },
  bannerBody: { color: '#fff', fontSize: 16, fontWeight: 600 },
  storage: { flexDirection: 'row', alignItems: 'center' },
  freed: { fontSize: 28, lineHeight: 34, fontWeight: 800 },
});
