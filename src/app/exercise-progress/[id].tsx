import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Chip } from '@/components/chip';
import { LineChart } from '@/components/line-chart';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { ExerciseKind } from '@/data/exercises';
import { useAllExercises } from '@/lib/custom-exercises';
import { dayLabel } from '@/lib/history';
import {
  changeLabel,
  metricsFor,
  recordsFor,
  toSessions,
  trimNumber,
  useSetPointsByExercise,
  type Session,
} from '@/lib/progress';
import { formatDuration, METERS_PER_MILE } from '@/lib/workouts';
import { useTheme } from '@/hooks/use-theme';

/** The chart shows at most this many of your most recent sessions. */
const CHART_SESSIONS = 20;

/** One exercise's progress: chart over time, all-time records, and every session. */
export default function ExerciseProgressScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const byExercise = useSetPointsByExercise();
  const exercises = useAllExercises();
  const exercise = exercises.find((e) => e.id === id);
  const kind: ExerciseKind = exercise?.kind ?? 'strength';

  const sessions = useMemo(() => toSessions(byExercise?.get(id ?? '') ?? []), [byExercise, id]);
  const metrics = metricsFor(kind, sessions);
  const [metricKey, setMetricKey] = useState<string | null>(null);
  const metric = metrics.find((m) => m.key === metricKey) ?? metrics[0];
  const records = recordsFor(kind, sessions);

  const charted = sessions.slice(-CHART_SESSIONS);
  const values = charted.map(metric.value);
  const latest = values[values.length - 1];
  const best = values.length ? Math.max(...sessions.map(metric.value)) : 0;
  const change = changeLabel(metric, sessions);

  return (
    <SafeAreaView edges={['top']} style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <View style={styles.topBar}>
        <ThemedText style={styles.heading} numberOfLines={1}>
          {exercise?.name ?? 'Exercise'}
        </ThemedText>
        <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={8}>
          <ThemedText type="smallBold" themeColor="accent" style={styles.done}>
            Done
          </ThemedText>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <ThemedText type="small" themeColor="textSecondary">
          {[exercise?.muscle, exercise?.equipment, `${sessions.length} ${sessions.length === 1 ? 'session' : 'sessions'}`]
            .filter(Boolean)
            .join('  ·  ')}
        </ThemedText>

        {byExercise !== undefined && sessions.length === 0 ? (
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="small" themeColor="textSecondary">
              No finished workouts with this exercise yet.
            </ThemedText>
          </ThemedView>
        ) : null}

        {sessions.length > 0 ? (
          <>
            {metrics.length > 1 ? (
              <View style={styles.chips}>
                {metrics.map((m) => (
                  <Chip key={m.key} label={m.label} selected={m.key === metric.key} onPress={() => setMetricKey(m.key)} />
                ))}
              </View>
            ) : null}

            <ThemedView type="backgroundElement" style={styles.card}>
              <View style={styles.headlineRow}>
                <View>
                  <ThemedText type="small" themeColor="textSecondary">
                    Latest {metric.label.toLowerCase()}
                  </ThemedText>
                  <ThemedText style={styles.headline}>{metric.format(latest)}</ThemedText>
                </View>
                <View style={styles.headlineRight}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Best {metric.format(best)}
                  </ThemedText>
                  {change ? (
                    <ThemedText type="smallBold" themeColor={change.startsWith('+') ? 'accent' : 'textSecondary'}>
                      {change} since first
                    </ThemedText>
                  ) : null}
                </View>
              </View>

              {values.length > 1 ? (
                <LineChart
                  values={values}
                  height={170}
                  formatValue={metric.format}
                  startLabel={shortDate(charted[0].startedAt)}
                  endLabel={shortDate(charted[charted.length - 1].startedAt)}
                />
              ) : (
                <ThemedText type="small" themeColor="textSecondary" style={styles.oneSession}>
                  Log this exercise in another workout to see a chart.
                </ThemedText>
              )}
            </ThemedView>

            {records.length > 0 ? (
              <View style={styles.section}>
                <ThemedText type="smallBold" themeColor="textSecondary" style={styles.caps}>
                  Personal records
                </ThemedText>
                <ThemedView type="backgroundElement" style={styles.list}>
                  {records.map((r, i) => (
                    <View
                      key={r.label}
                      style={[styles.listRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.backgroundSelected }]}>
                      <View style={styles.flex}>
                        <ThemedText>{r.label}</ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {dayLabel(r.startedAt)}
                        </ThemedText>
                      </View>
                      <View style={styles.recordValue}>
                        <ThemedText style={styles.recordNumber}>{r.value}</ThemedText>
                        {r.detail ? (
                          <ThemedText type="small" themeColor="textSecondary">
                            {r.detail}
                          </ThemedText>
                        ) : null}
                      </View>
                    </View>
                  ))}
                </ThemedView>
              </View>
            ) : null}

            <View style={styles.section}>
              <ThemedText type="smallBold" themeColor="textSecondary" style={styles.caps}>
                Sessions
              </ThemedText>
              <ThemedView type="backgroundElement" style={styles.list}>
                {[...sessions].reverse().map((s, i) => (
                  <Pressable
                    key={s.workoutId}
                    onPress={() => router.push({ pathname: '/workouts/[id]', params: { id: s.workoutId } })}
                    accessibilityRole="button"
                    style={({ pressed }) => [
                      styles.listRow,
                      i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.backgroundSelected },
                      { opacity: pressed ? 0.7 : 1 },
                    ]}>
                    <View style={styles.flex}>
                      <ThemedText>{dayLabel(s.startedAt)}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {sessionSummary(kind, s)}
                      </ThemedText>
                    </View>
                    <ThemedText themeColor="textSecondary">›</ThemedText>
                  </Pressable>
                ))}
              </ThemedView>
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

/** "Oct 14" */
function shortDate(ms: number) {
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** "4 sets · top 185 × 5 · 2,960 lb" and friends. */
function sessionSummary(kind: ExerciseKind, s: Session) {
  const sets = `${s.sets} ${s.sets === 1 ? 'set' : 'sets'}`;
  if (kind === 'strength') {
    const top = s.maxWeightSet ? `top ${trimNumber(s.maxWeightSet.weight)} × ${s.maxWeightSet.reps}` : null;
    return [sets, top, s.volume > 0 ? `${Math.round(s.volume).toLocaleString()} lb` : null].filter(Boolean).join('  ·  ');
  }
  if (kind === 'bodyweight') return `${sets}  ·  best ${s.maxReps} reps  ·  ${s.totalReps} total`;
  return [
    s.totalDistanceM > 0 ? `${trimNumber(s.totalDistanceM / METERS_PER_MILE)} mi` : null,
    s.totalDurationSec > 0 ? formatDuration(s.totalDurationSec) : null,
  ]
    .filter(Boolean)
    .join('  ·  ');
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  flex: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  heading: { flex: 1, fontSize: 20, lineHeight: 26, fontWeight: 800 },
  done: { fontSize: 16 },
  body: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.six, gap: Spacing.three },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  card: { borderRadius: 16, padding: Spacing.three, gap: Spacing.three },
  headlineRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  headline: { fontSize: 30, lineHeight: 36, fontWeight: 800 },
  headlineRight: { alignItems: 'flex-end' },
  oneSession: { textAlign: 'center', paddingVertical: Spacing.three },
  section: { gap: Spacing.two },
  caps: { textTransform: 'uppercase', letterSpacing: 1, fontSize: 12, paddingHorizontal: Spacing.two },
  list: { borderRadius: 16, overflow: 'hidden' },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingHorizontal: Spacing.three, paddingVertical: 12 },
  recordValue: { alignItems: 'flex-end' },
  recordNumber: { fontWeight: 800 },
});
