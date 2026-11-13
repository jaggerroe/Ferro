import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formStyles } from '@/components/form';
import { FlagPill } from '@/components/labs-view';
import { LineChart } from '@/components/line-chart';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { activeOn, formatLabDate, rangeFlag, useLabMarkers } from '@/lib/health';
import { formatAmount, getCompounds, useMedsVersion, type Compound } from '@/lib/meds';

/**
 * Every result for one marker (`/lab-marker?marker=alt`): chart, the normal
 * range from your report, and each result with what you were taking then.
 * Tap a result to edit it.
 */
export default function LabMarkerScreen() {
  const theme = useTheme();
  const db = useSQLiteContext();
  const { marker: key } = useLocalSearchParams<{ marker: string }>();
  const markers = useLabMarkers();
  const changes = useMedsVersion();
  const [compounds, setCompounds] = useState<Compound[]>([]);

  useEffect(() => {
    getCompounds(db)
      .then(setCompounds)
      .catch((err) => console.warn('Could not load meds', err));
  }, [db, changes]);

  const marker = markers?.find((m) => m.key === key);
  const results = marker?.results ?? [];
  const unit = marker?.latest.unit ?? '';
  // The most recent result that has a range printed on it.
  const withRange = [...results].reverse().find((r) => r.ref_low !== null || r.ref_high !== null);

  return (
    <SafeAreaView edges={['top', 'bottom']} style={[formStyles.safeArea, { backgroundColor: theme.background }]}>
      <View style={formStyles.topBar}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={8}>
          <ThemedText themeColor="textSecondary" style={formStyles.barButton}>
            Close
          </ThemedText>
        </Pressable>
        <ThemedText style={formStyles.heading} numberOfLines={1}>
          {marker?.name ?? 'Lab results'}
        </ThemedText>
        <Pressable
          onPress={() => router.push({ pathname: '/lab-result', params: marker ? { marker: marker.name } : {} })}
          accessibilityRole="button"
          accessibilityLabel={`Add a ${marker?.name ?? ''} result`}
          hitSlop={8}>
          <ThemedText type="smallBold" themeColor="accent" style={formStyles.barButton}>
            + Add
          </ThemedText>
        </Pressable>
      </View>

      {markers && !marker ? (
        <ThemedText themeColor="textSecondary" style={styles.center}>
          No results left for this marker.
        </ThemedText>
      ) : (
        <ScrollView contentContainerStyle={formStyles.body}>
          {results.length > 1 ? (
            <ThemedView type="backgroundElement" style={styles.card}>
              <LineChart
                values={results.map((r) => r.value)}
                height={170}
                formatValue={(n) => formatAmount(Number(n.toPrecision(3)), unit)}
                startLabel={shortDate(results[0].drawn_at)}
                endLabel={shortDate(results[results.length - 1].drawn_at)}
              />
              <ThemedText type="small" themeColor="textSecondary">
                Points are evenly spaced, one per test, oldest on the left.
              </ThemedText>
            </ThemedView>
          ) : null}

          {withRange ? (
            <ThemedText type="small" themeColor="textSecondary">
              Normal range on your report: {rangeText(withRange.ref_low, withRange.ref_high)} {withRange.unit}
            </ThemedText>
          ) : (
            <ThemedText type="small" themeColor="textSecondary">
              Tip: add the normal range from your lab report to a result and Ferro will mark values outside it.
            </ThemedText>
          )}

          <ThemedView type="backgroundElement" style={styles.list}>
            {[...results].reverse().map((r, i) => {
              const flag = rangeFlag(r);
              const taking = activeOn(compounds, r.drawn_at);
              return (
                <Pressable
                  key={r.id}
                  onPress={() => router.push({ pathname: '/lab-result', params: { id: r.id } })}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit result from ${formatLabDate(r.drawn_at)}`}
                  style={({ pressed }) => [
                    styles.row,
                    i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.backgroundSelected },
                    { opacity: pressed ? 0.7 : 1 },
                  ]}>
                  <View style={styles.rowTop}>
                    <ThemedText style={styles.date}>{formatLabDate(r.drawn_at)}</ThemedText>
                    <View style={styles.valueRow}>
                      {flag ? <FlagPill flag={flag} /> : null}
                      <ThemedText style={styles.value}>{formatAmount(r.value, r.unit)}</ThemedText>
                    </View>
                  </View>
                  {taking.length > 0 ? (
                    <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
                      Taking: {taking.join(', ')}
                    </ThemedText>
                  ) : null}
                  {r.notes ? (
                    <ThemedText type="small" themeColor="textSecondary" numberOfLines={3}>
                      {r.notes}
                    </ThemedText>
                  ) : null}
                </Pressable>
              );
            })}
          </ThemedView>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function rangeText(low: number | null, high: number | null) {
  if (low !== null && high !== null) return `${low}–${high}`;
  if (high !== null) return `under ${high}`;
  return `over ${low}`;
}

function shortDate(ms: number) {
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const styles = StyleSheet.create({
  center: { textAlign: 'center', padding: Spacing.three },
  card: { borderRadius: 16, padding: Spacing.three, gap: Spacing.two },
  list: { borderRadius: 14, overflow: 'hidden' },
  row: { paddingHorizontal: Spacing.three, paddingVertical: 12, gap: 4 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.three },
  date: { fontSize: 16, fontWeight: 600 },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  value: { fontSize: 16, fontWeight: 800 },
});
