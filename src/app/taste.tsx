import { StyleSheet, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';

import { Card, PickyButton, Screen, StatusChip } from '@/components/picky/ui';
import { ThemedText } from '@/components/themed-text';
import { Accent, AccentSoft, AgainstColor, SupportColor } from '@/constants/picky';
import { Spacing } from '@/constants/theme';
import { usePicky } from '@/hooks/use-picky';
import { useTheme } from '@/hooks/use-theme';
import type { Criterion } from '@/lib/types';

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

      {criteria.map((c) => (
        <CriterionRow key={c.key} criterion={c} />
      ))}

      <PickyButton label="Reset (start the demo over)" variant="ghost" onPress={actions.reset} />
    </Screen>
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
});
