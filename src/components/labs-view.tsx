import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { LineChart } from '@/components/line-chart';
import { PlaceholderCard } from '@/components/placeholder-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatLabDate, rangeFlag, useLabMarkers, type Marker } from '@/lib/health';
import { formatAmount } from '@/lib/meds';

/**
 * Meds tab → Labs. One card per marker (ALT, triglycerides, ...) with the
 * latest value and a small chart. Tap a card for every result.
 */
export function LabsView() {
  const theme = useTheme();
  const markers = useLabMarkers();
  if (!markers) return null;

  return (
    <>
      <Pressable
        onPress={() => router.push('/lab-result')}
        accessibilityRole="button"
        style={({ pressed }) => [styles.addButton, { backgroundColor: theme.accent, opacity: pressed ? 0.8 : 1 }]}>
        <ThemedText style={[styles.addLabel, { color: theme.onAccent }]}>+ Add lab result</ThemedText>
      </Pressable>

      {markers.length === 0 ? (
        <PlaceholderCard
          title="No lab results yet"
          body="Copy results from your blood work, one marker at a time. Add the normal range printed on your report and Ferro marks anything outside it."
        />
      ) : (
        markers.map((m) => <MarkerCard key={m.key} marker={m} />)
      )}
    </>
  );
}

function MarkerCard({ marker }: { marker: Marker }) {
  const theme = useTheme();
  const flag = rangeFlag(marker.latest);
  const count = marker.results.length;
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/lab-marker', params: { marker: marker.key } })}
      accessibilityRole="button"
      accessibilityLabel={`${marker.name}, latest ${formatAmount(marker.latest.value, marker.latest.unit)}${flag ? `, ${flag}` : ''}`}>
      {({ pressed }) => (
        <ThemedView type="backgroundElement" style={[styles.card, { opacity: pressed ? 0.8 : 1 }]}>
          <View style={styles.top}>
            <View style={styles.flex}>
              <ThemedText style={styles.name} numberOfLines={1}>
                {marker.name}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {formatLabDate(marker.latest.drawn_at)} · {count} {count === 1 ? 'result' : 'results'}
              </ThemedText>
            </View>
            <View style={styles.valueBox}>
              <ThemedText style={styles.value}>{formatAmount(marker.latest.value, marker.latest.unit)}</ThemedText>
              {flag ? <FlagPill flag={flag} /> : null}
            </View>
          </View>
          {count > 1 ? (
            <LineChart values={marker.results.map((r) => r.value)} height={56} compact />
          ) : null}
        </ThemedView>
      )}
    </Pressable>
  );
}

/** "High" / "Low" next to a value outside the range from your lab report. */
export function FlagPill({ flag }: { flag: 'High' | 'Low' }) {
  const theme = useTheme();
  return (
    <View style={[styles.flag, { borderColor: theme.danger }]}>
      <ThemedText type="smallBold" themeColor="danger" style={styles.flagText}>
        {flag}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  addButton: { borderRadius: 14, paddingVertical: Spacing.three, alignItems: 'center' },
  addLabel: { fontSize: 17, fontWeight: 800 },
  card: { borderRadius: 16, padding: Spacing.three, gap: Spacing.two },
  top: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  name: { fontSize: 17, lineHeight: 22, fontWeight: 700 },
  valueBox: { alignItems: 'flex-end', gap: 4 },
  value: { fontSize: 17, lineHeight: 22, fontWeight: 800 },
  flag: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 1 },
  flagText: { fontSize: 12, lineHeight: 16 },
});
