import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Chip } from '@/components/chip';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  DEFAULT_TAGS,
  mergeTags,
  nextSeverity,
  SEVERITIES,
  setCheckIn,
  useCheckIns,
  type Severity,
} from '@/lib/health';

/**
 * Meds tab → Check-ins. Tap a symptom to rate it for today (or yesterday):
 * each tap goes mild → moderate → bad → cleared. Below, the last 7 days as
 * a grid, which is handy to show at a checkup.
 */
export function CheckInsView() {
  const theme = useTheme();
  const db = useSQLiteContext();
  const data = useCheckIns();
  const [dayIndex, setDayIndex] = useState<6 | 5>(6); // 6 = today, 5 = yesterday (index into the last 7 days)
  const [added, setAdded] = useState<string[]>([]); // your new tags, until you rate them
  const [newTag, setNewTag] = useState('');

  if (!data) return null;
  const day = data.days[dayIndex];
  const tags = mergeTags(DEFAULT_TAGS, data.usedTags, added);
  const severityOf = (tag: string) => data.grid.get(tag)?.get(day) ?? null;

  function addTag() {
    const t = newTag.trim();
    if (!t) return;
    setAdded((a) => [...a, t]);
    setNewTag('');
  }

  // Rows in the grid: anything rated in the last 7 days.
  const gridTags = [...data.grid.keys()].sort((a, b) => a.localeCompare(b));

  return (
    <>
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText style={styles.title}>How are you feeling?</ThemedText>
        <View style={styles.chips}>
          <Chip label="Today" selected={dayIndex === 6} onPress={() => setDayIndex(6)} />
          <Chip label="Yesterday" selected={dayIndex === 5} onPress={() => setDayIndex(5)} />
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          Tap to rate: mild, moderate, bad. Tap again to clear.
        </ThemedText>
        <View style={styles.tags}>
          {tags.map((tag) => {
            const sev = severityOf(tag);
            const label = sev ? SEVERITIES[sev - 1].label : null;
            return (
              <Pressable
                key={tag}
                onPress={() => setCheckIn(db, day, tag, nextSeverity(sev)).catch((e) => console.warn('Could not save', e))}
                accessibilityRole="button"
                accessibilityLabel={`${tag}: ${label ?? 'not rated'}. Tap to change.`}
                style={({ pressed }) => [
                  styles.tag,
                  { backgroundColor: severityBackground(theme, sev), opacity: pressed ? 0.8 : 1 },
                ]}>
                <ThemedText type="smallBold" style={{ color: sev === 3 ? theme.onAccent : theme.text }}>
                  {tag}
                  {label ? ` · ${label}` : ''}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.addRow}>
          <TextInput
            value={newTag}
            onChangeText={setNewTag}
            onSubmitEditing={addTag}
            placeholder="Add your own"
            placeholderTextColor={theme.textSecondary}
            maxLength={40}
            returnKeyType="done"
            style={[styles.input, { backgroundColor: theme.background, color: theme.text }]}
          />
          <Pressable onPress={addTag} disabled={!newTag.trim()} accessibilityRole="button" hitSlop={8}>
            <ThemedText type="smallBold" themeColor={newTag.trim() ? 'accent' : 'textSecondary'}>
              Add
            </ThemedText>
          </Pressable>
        </View>
      </ThemedView>

      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText style={styles.title}>Last 7 days</ThemedText>
        {gridTags.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            Nothing rated yet. What you rate above shows up here.
          </ThemedText>
        ) : (
          <>
            <View style={styles.gridRow}>
              <View style={styles.gridLabel} />
              {data.days.map((d) => (
                <ThemedText key={d} type="small" themeColor="textSecondary" style={styles.gridHead}>
                  {weekdayLetter(d)}
                </ThemedText>
              ))}
            </View>
            {gridTags.map((tag) => (
              <View key={tag} style={styles.gridRow}>
                <ThemedText type="small" numberOfLines={1} style={styles.gridLabel}>
                  {tag}
                </ThemedText>
                {data.days.map((d) => {
                  const sev = data.grid.get(tag)?.get(d) ?? null;
                  return (
                    <View
                      key={d}
                      accessible
                      accessibilityLabel={`${tag}, ${d}: ${sev ? SEVERITIES[sev - 1].label : 'none'}`}
                      style={[styles.cell, { backgroundColor: severityBackground(theme, sev) }]}
                    />
                  );
                })}
              </View>
            ))}
            <View style={styles.legend}>
              {SEVERITIES.map((s) => (
                <View key={s.value} style={styles.legendItem}>
                  <View style={[styles.legendSwatch, { backgroundColor: severityBackground(theme, s.value) }]} />
                  <ThemedText type="small" themeColor="textSecondary">
                    {s.label}
                  </ThemedText>
                </View>
              ))}
            </View>
          </>
        )}
      </ThemedView>
    </>
  );
}

/** Light → dark indigo for mild → bad; plain grey when not rated. */
function severityBackground(theme: ReturnType<typeof useTheme>, sev: Severity | null) {
  if (sev === null) return theme.backgroundSelected;
  // Hex alpha on the accent: about 25%, 55%, then solid.
  return sev === 1 ? `${theme.accent}40` : sev === 2 ? `${theme.accent}8C` : theme.accent;
}

/** "2026-11-13" → "F". */
function weekdayLetter(day: string) {
  const [y, m, d] = day.split('-').map(Number);
  return ['S', 'M', 'T', 'W', 'T', 'F', 'S'][new Date(y, m - 1, d).getDay()];
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, padding: Spacing.three, gap: Spacing.two },
  title: { fontSize: 18, lineHeight: 24, fontWeight: 800 },
  chips: { flexDirection: 'row', gap: Spacing.two },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginTop: Spacing.one },
  tag: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, marginTop: Spacing.one },
  input: { flex: 1, borderRadius: 10, paddingHorizontal: Spacing.three, paddingVertical: 10, fontSize: 15 },
  gridRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  gridLabel: { width: 96 },
  gridHead: { flex: 1, textAlign: 'center' },
  cell: { flex: 1, height: 22, borderRadius: 6 },
  legend: { flexDirection: 'row', gap: Spacing.three, marginTop: Spacing.one },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 12, height: 12, borderRadius: 3 },
});
