import { StyleSheet, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';

import { Card, PickyButton, Screen, StatusChip } from '@/components/picky/ui';
import { ThemedText } from '@/components/themed-text';
import { Accent, AccentSoft, AgainstColor, SupportColor } from '@/constants/picky';
import { Spacing } from '@/constants/theme';
import { usePicky } from '@/hooks/use-picky';
import { useTheme } from '@/hooks/use-theme';
import { evaluate } from '@/lib/taste';
import type { Criterion, PickyState } from '@/lib/types';

export default function TasteScreen() {
  const { state, actions } = usePicky();
  const { criteria, summary } = state.profile;

  return (
    <Screen title="Your taste" subtitle="Learned from your choices — not from anyone else's.">
      <Card style={styles.summary}>
        <ThemedText style={styles.summaryText}>
          {summary ?? 'No evidence yet. Answer a few "Your call" questions and Picky will figure out your rule.'}
        </ThemedText>
      </Card>

      <AccuracyCard state={state} />

      {criteria.map((c) => (
        <CriterionRow key={c.key} criterion={c} />
      ))}

      <PickyButton label="Reset (start the demo over)" variant="ghost" onPress={actions.reset} />
    </Screen>
  );
}

// How often Picky's keepers include the photo you picked beforehand, after 0, 1, 2… answers.
function AccuracyCard({ state }: { state: PickyState }) {
  const theme = useTheme();
  const picks = state.myPicks ?? {};
  if (Object.keys(picks).length === 0) {
    return (
      <Card>
        <ThemedText type="smallBold">Accuracy test</ThemedText>
        <ThemedText themeColor="textSecondary">
          On Today, tap the photo you picked beforehand in each scene (⭐). Then answer Your call — this card shows how
          often Picky keeps your pick after each answer.
        </ThemedText>
      </Card>
    );
  }
  const history = state.profileHistory ?? [state.profile];
  const rows = history.map((profile, i) => ({ i, ...evaluate(state, profile, picks) }));
  const { generic, total } = rows[0];
  const pct = (n: number) => (total ? n / total : 0);
  return (
    <Card>
      <ThemedText type="smallBold">Accuracy test · {total} scenes you picked beforehand</ThemedText>
      <View style={styles.accRow}>
        <ThemedText type="small" style={styles.accLabel}>
          Generic app
        </ThemedText>
        <View style={[styles.track, styles.accTrack, { backgroundColor: theme.backgroundSelected }]}>
          <View style={{ flex: pct(generic), backgroundColor: theme.textSecondary }} />
          <View style={{ flex: 1 - pct(generic) }} />
        </View>
        <ThemedText type="smallBold" style={styles.accValue}>
          {generic}/{total}
        </ThemedText>
      </View>
      {rows.map((r) => (
        <View key={r.i} style={styles.accRow}>
          <ThemedText type="small" style={styles.accLabel}>
            Picky · {r.i} {r.i === 1 ? 'answer' : 'answers'}
          </ThemedText>
          <View style={[styles.track, styles.accTrack, { backgroundColor: theme.backgroundSelected }]}>
            <View style={{ flex: pct(r.picky), backgroundColor: Accent }} />
            <View style={{ flex: 1 - pct(r.picky) }} />
          </View>
          <ThemedText type="smallBold" style={styles.accValue}>
            {r.picky}/{r.total}
          </ThemedText>
        </View>
      ))}
      <ThemedText type="small" themeColor="textSecondary">
        A hit = Picky&apos;s 1–3 keepers include your pick. Includes scenes you answered questions on.
      </ThemedText>
    </Card>
  );
}

function CriterionRow({ criterion: c }: { criterion: Criterion }) {
  const theme = useTheme();
  const total = c.support + c.against;
  const greyed = c.status === 'doesnt_care';
  const arrow = c.lastChange === 'up' ? '↑' : c.lastChange === 'down' ? '↓' : c.lastChange === 'new' ? 'NEW' : null;

  return (
    <Card style={[c.lastChange && styles.changed, greyed && styles.greyed]}>
      <View style={styles.top}>
        <View style={{ flex: 1 }}>
          <ThemedText style={styles.name}>{c.name}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {c.kind === 'style' ? 'style · no right answer' : 'looks'} · evidence: {total}
          </ThemedText>
        </View>
        {arrow ? (
          <Animated.View key={`${c.support}-${c.against}`} entering={ZoomIn.springify()} style={styles.arrow}>
            <ThemedText style={styles.arrowText}>{arrow}</ThemedText>
          </Animated.View>
        ) : null}
        <StatusChip status={c.status} />
      </View>

      <View style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
        {total > 0 ? (
          <>
            <View style={{ flex: c.support, backgroundColor: SupportColor }} />
            <View style={{ flex: c.against, backgroundColor: AgainstColor }} />
          </>
        ) : null}
      </View>
      <View style={styles.counts}>
        <ThemedText type="small" style={{ color: SupportColor }}>
          chose it {c.support}×
        </ThemedText>
        <ThemedText type="small" style={{ color: AgainstColor }}>
          chose against it {c.against}×
        </ThemedText>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  summary: { backgroundColor: AccentSoft },
  summaryText: { fontSize: 18, lineHeight: 26, fontWeight: 700 },
  changed: { borderWidth: 2, borderColor: Accent },
  greyed: { opacity: 0.55 },
  top: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  name: { fontSize: 18, fontWeight: 700 },
  arrow: { backgroundColor: Accent, borderRadius: 999, paddingHorizontal: Spacing.two, minWidth: 28, alignItems: 'center' },
  arrowText: { color: '#fff', fontWeight: 800 },
  track: { height: 10, borderRadius: 5, overflow: 'hidden', flexDirection: 'row' },
  counts: { flexDirection: 'row', justifyContent: 'space-between' },
  accRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  accLabel: { width: 112 },
  accTrack: { flex: 1 },
  accValue: { width: 36, textAlign: 'right' },
});
