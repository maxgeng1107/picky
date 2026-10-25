import { ScrollView, StyleSheet, View } from 'react-native';

import { Card, Photo } from '@/components/picky/ui';
import { ThemedText } from '@/components/themed-text';
import { Accent } from '@/constants/picky';
import { Spacing } from '@/constants/theme';
import type { Photo as PhotoT, PhotoId, Scene, TasteProfile } from '@/lib/types';

export function SceneCard({
  scene,
  photosById,
  profile,
}: {
  scene: Scene;
  photosById: Record<PhotoId, PhotoT>;
  profile: TasteProfile;
}) {
  const kept = scene.keptIds.map((id) => photosById[id]);
  const binned = scene.photoIds.map((id) => photosById[id]).filter((p) => p.status === 'binned');
  const main = kept[0];
  const generic = photosById[scene.genericKeptIds[0]];
  const learned = profile.criteria.some((c) => c.support + c.against > 0);
  const differs = learned && generic && main && generic.id !== main.id;

  return (
    <Card>
      <View style={styles.row}>
        <ThemedText type="smallBold" style={styles.label}>
          {scene.label ?? 'Scene'}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          kept {kept.length} of {scene.photoIds.length}
        </ThemedText>
      </View>

      {differs ? (
        <View style={styles.compare}>
          <View style={styles.compareCol}>
            <ThemedText type="small" themeColor="textSecondary">
              A generic app keeps
            </ThemedText>
            <Photo uri={generic.uri} dimmed />
          </View>
          <View style={styles.compareCol}>
            <ThemedText type="smallBold" style={{ color: Accent }}>
              Picky keeps
            </ThemedText>
            <Photo uri={main.uri} style={styles.pickyBorder} />
          </View>
        </View>
      ) : main ? (
        <View style={styles.keptRow}>
          {kept.map((p) => (
            <Photo key={p.id} uri={p.uri} style={styles.keptPhoto} badge={p.rescued ? 'Rescued' : 'Kept'} />
          ))}
        </View>
      ) : null}

      {main?.reason ? <ThemedText style={styles.reason}>{main.reason}</ThemedText> : null}

      {differs && kept.length > 1 ? (
        <View style={{ gap: Spacing.two }}>
          <ThemedText type="small" themeColor="textSecondary">
            Also kept
          </ThemedText>
          <View style={styles.binRow}>
            {kept.slice(1).map((p) => (
              <Photo key={p.id} uri={p.uri} style={styles.alsoKept} badge={p.rescued ? 'Rescued' : undefined} />
            ))}
          </View>
        </View>
      ) : null}

      {binned.length > 0 ? (
        <View style={{ gap: Spacing.two }}>
          <ThemedText type="small" themeColor="textSecondary">
            {binned.some((p) => p.deleted)
              ? `${binned.filter((p) => p.deleted).length} originals removed · ${binned.filter((p) => p.driveFileId).length} JPEG copies backed up`
              : binned.some((p) => p.driveFileId)
                ? `${binned.filter((p) => p.driveFileId).length} JPEG copies backed up · originals still on phone`
                : `${binned.length} not suggested · originals still on phone`}
          </ThemedText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.binRow}>
            {binned.map((p) => (
              <Photo key={p.id} uri={p.uri} dimmed style={styles.thumb} badge={p.gated ? '✕' : undefined} />
            ))}
          </ScrollView>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: 18 },
  compare: { flexDirection: 'row', gap: Spacing.three },
  compareCol: { flex: 1, gap: Spacing.one },
  pickyBorder: { borderWidth: 3, borderColor: Accent },
  keptRow: { flexDirection: 'row', gap: Spacing.two },
  keptPhoto: { flex: 1, maxWidth: 260 },
  reason: { fontSize: 16, fontWeight: 600 },
  binRow: { flexDirection: 'row', gap: Spacing.two },
  alsoKept: { width: 96 },
  thumb: { width: 64 },
});
