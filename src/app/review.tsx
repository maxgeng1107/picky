import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';

import { Card, Photo, PickyButton, Screen } from '@/components/picky/ui';
import { ThemedText } from '@/components/themed-text';
import { Accent, AgainstColor, SupportColor } from '@/constants/picky';
import { Spacing } from '@/constants/theme';
import { usePicky } from '@/hooks/use-picky';
import { useTheme } from '@/hooks/use-theme';
import type { Answer, Criterion, Scores } from '@/lib/types';

export default function ReviewScreen() {
  const { state, actions } = usePicky();
  const toast = useLearnedToast(state.profile.criteria);
  const review = state.review;

  if (!review) {
    const done = state.scenes.some((s) => s.reviewed);
    return (
      <Screen title="Your call" subtitle="Picky only asks when it isn't sure.">
        {toast}
        <Card style={styles.empty}>
          <ThemedText style={styles.emptyTitle}>
            {state.busy ? 'Picky is picking…' : done ? 'All caught up 🎉' : 'Nothing to review yet'}
          </ThemedText>
          {state.busy && state.status ? <ThemedText themeColor="textSecondary">{state.status}</ThemedText> : null}
          <PickyButton
            label={done ? 'See what Picky learned' : 'Go to Today'}
            variant="outline"
            onPress={() => router.push(done ? '/taste' : '/')}
          />
        </Card>
      </Screen>
    );
  }

  const A = state.photosById[review.aId];
  const B = state.photosById[review.bId];
  const scene = state.scenes.find((s) => s.id === review.sceneId);
  const answer = (a: Answer) => actions.answer(a, state.review ?? undefined);

  return (
    <Screen
      title="Your call"
      subtitle={`${review.index + 1} of ${review.total} · ${scene?.label ?? ''} · which one would you post?`}>
      <View style={styles.pair}>
        <View style={styles.col}>
          <ThemedText type="smallBold">A · In your album</ThemedText>
          <Photo uri={A.uri} style={styles.selected} />
        </View>
        <View style={styles.col}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            B · Another original
          </ThemedText>
          <Photo uri={B.uri} />
        </View>
      </View>

      <View style={styles.buttons}>
        <PickyButton label="Keep A" variant="outline" style={styles.half} onPress={() => answer('keepA')} />
        <PickyButton label="B replaces A" style={styles.half} onPress={() => answer('replace')} />
      </View>
      <View style={styles.buttons}>
        <PickyButton label="Keep both" variant="ghost" style={styles.half} onPress={() => answer('keepBoth')} />
        <PickyButton label="Skip" variant="ghost" style={styles.half} onPress={() => answer('skip')} />
      </View>

      {toast}

      <ScoreCompare criteria={state.profile.criteria} a={A.scores} b={B.scores} />
    </Screen>
  );
}

// Shows "face looks smaller ↑ · facing the camera ↓" for a moment after each answer.
function useLearnedToast(criteria: Criterion[]) {
  // the toast belongs to one profile update; hide it 2.5 s after that update
  const [dismissed, setDismissed] = useState<Criterion[] | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setDismissed(criteria), 2500);
    return () => clearTimeout(t);
  }, [criteria]);
  const changed = criteria.filter((c) => c.lastChange);
  if (changed.length === 0 || dismissed === criteria) return null;
  const message = changed.map((c) => `${c.name} ${c.lastChange === 'down' ? '↓' : '↑'}`).join(' · ');
  return (
    <Animated.View entering={FadeInDown} exiting={FadeOut} style={styles.toast}>
      <ThemedText style={styles.toastText}>Learned: {message}</ThemedText>
    </Animated.View>
  );
}

// The "glass box": what the AI saw in A and B, per criterion.
function ScoreCompare({ criteria, a, b }: { criteria: Criterion[]; a?: Scores; b?: Scores }) {
  const theme = useTheme();
  if (!a || !b) return null;
  return (
    <Card>
      <ThemedText type="smallBold">Visible attributes (1–5; ties are allowed)</ThemedText>
      {criteria.map((c) => {
        const sa = a[c.key];
        const sb = b[c.key];
        if (sa == null || sb == null) return null;
        return (
          <View key={c.key} style={styles.scoreRow}>
            <ThemedText type="small" style={styles.scoreName}>
              {c.name}
            </ThemedText>
            <View style={styles.bars}>
              <Bar value={sa} color={theme.text} label="A" />
              <Bar value={sb} color={sb > sa ? SupportColor : sb < sa ? AgainstColor : theme.textSecondary} label="B" />
            </View>
          </View>
        );
      })}
    </Card>
  );
}

function Bar({ value, color, label }: { value: number; color: string; label: string }) {
  const theme = useTheme();
  return (
    <View style={styles.barRow}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.barLabel}>
        {label}
      </ThemedText>
      <View style={[styles.barTrack, { backgroundColor: theme.backgroundSelected }]}>
        <View style={[styles.barFill, { width: `${(value / 5) * 100}%`, backgroundColor: color }]} />
      </View>
      <ThemedText type="small" style={styles.barValue}>
        {value}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', paddingVertical: Spacing.five },
  emptyTitle: { fontSize: 22, fontWeight: 700 },
  pair: { flexDirection: 'row', gap: Spacing.three },
  col: { flex: 1, gap: Spacing.one },
  selected: { borderWidth: 3, borderColor: Accent },
  buttons: { flexDirection: 'row', gap: Spacing.two },
  half: { flex: 1, paddingHorizontal: Spacing.two },
  toast: { backgroundColor: '#111827', borderRadius: Spacing.three, padding: Spacing.three },
  toastText: { color: '#fff', fontWeight: 700 },
  scoreRow: { gap: Spacing.one },
  scoreName: { fontWeight: 600 },
  bars: { gap: Spacing.half },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  barLabel: { width: 14 },
  barTrack: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4 },
  barValue: { width: 14, textAlign: 'right' },
});
