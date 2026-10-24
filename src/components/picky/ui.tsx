import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, StatusColors, StatusLabels } from '@/constants/picky';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { CriterionStatus } from '@/lib/types';

export function Screen({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <ThemedView style={styles.fill}>
      <SafeAreaView style={styles.fill} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.header}>
            <ThemedText style={styles.title}>{title}</ThemedText>
            {subtitle ? <ThemedText themeColor="textSecondary">{subtitle}</ThemedText> : null}
          </View>
          {children}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <ThemedView type="backgroundElement" style={[styles.card, style]}>
      {children}
    </ThemedView>
  );
}

type ButtonVariant = 'primary' | 'outline' | 'ghost';

export function PickyButton({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const isPrimary = variant === 'primary';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        isPrimary && { backgroundColor: Accent },
        variant === 'outline' && { borderWidth: 2, borderColor: theme.text },
        (pressed || disabled) && { opacity: 0.5 },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={isPrimary ? '#fff' : theme.text} />
      ) : (
        <ThemedText style={[styles.buttonLabel, isPrimary && { color: '#fff' }]}>{label}</ThemedText>
      )}
    </Pressable>
  );
}

export function Photo({
  uri,
  style,
  dimmed,
  badge,
}: {
  uri: string;
  style?: StyleProp<ViewStyle>;
  dimmed?: boolean;
  badge?: string;
}) {
  return (
    <View style={[styles.photo, style]}>
      <Image source={{ uri }} style={[StyleSheet.absoluteFill, dimmed && { opacity: 0.35 }]} contentFit="cover" transition={150} />
      {badge ? (
        <View style={styles.photoBadge}>
          <ThemedText style={styles.photoBadgeText}>{badge}</ThemedText>
        </View>
      ) : null}
    </View>
  );
}

export function StatusChip({ status }: { status: CriterionStatus }) {
  return (
    <View style={[styles.chip, { backgroundColor: StatusColors[status] }]}>
      <ThemedText style={styles.chipText}>{StatusLabels[status]}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scroll: {
    padding: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.five,
    gap: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  header: { gap: Spacing.one, marginBottom: Spacing.one },
  title: { fontSize: 34, lineHeight: 40, fontWeight: 800 },
  card: { borderRadius: Spacing.four, padding: Spacing.three, gap: Spacing.three },
  button: {
    minHeight: 52,
    borderRadius: 26,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLabel: { fontSize: 17, fontWeight: 700 },
  photo: { borderRadius: Spacing.three, overflow: 'hidden', backgroundColor: '#00000010', aspectRatio: 3 / 4 },
  photoBadge: {
    position: 'absolute',
    left: Spacing.two,
    top: Spacing.two,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
  },
  photoBadgeText: { color: '#fff', fontSize: 12, lineHeight: 16, fontWeight: 700 },
  chip: { borderRadius: 999, paddingHorizontal: Spacing.two + 2, paddingVertical: Spacing.half },
  chipText: { color: '#fff', fontSize: 13, lineHeight: 18, fontWeight: 700 },
});
