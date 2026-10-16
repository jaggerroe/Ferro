import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Chip } from '@/components/chip';
import { LineChart } from '@/components/line-chart';
import { PlaceholderCard } from '@/components/placeholder-card';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { Exercise } from '@/data/exercises';
import { useAllExercises } from '@/lib/custom-exercises';
import { dayLabel } from '@/lib/history';
import { useSettings } from '@/lib/settings';
import { changeLabel, metricsFor, toSessions, useSetPointsByExercise, type Session } from '@/lib/progress';

/** How many recent sessions the small chart on each card shows. */
const SPARKLINE_SESSIONS = 10;

type SortMode = 'recent' | 'most';

type Row = { exerciseId: string; exercise: Exercise | undefined; sessions: Session[] };

export default function ProgressScreen() {
  const byExercise = useSetPointsByExercise();
  useSettings(); // re-draw if you switch lb/kg
  const exercises = useAllExercises();
  const [sort, setSort] = useState<SortMode>('recent');

  const rows = useMemo(() => {
    const exerciseById = new Map(exercises.map((e) => [e.id, e]));
    const list: Row[] = [];
    for (const [exerciseId, points] of byExercise ?? []) {
      list.push({ exerciseId, exercise: exerciseById.get(exerciseId), sessions: toSessions(points) });
    }
    const lastAt = (r: Row) => r.sessions[r.sessions.length - 1]?.startedAt ?? 0;
    return list.sort((a, b) =>
      sort === 'recent' ? lastAt(b) - lastAt(a) : b.sessions.length - a.sessions.length || lastAt(b) - lastAt(a),
    );
  }, [byExercise, exercises, sort]);

  if (byExercise === undefined) return <Screen title="Progress" />;

  return (
    <Screen title="Progress">
      {rows.length === 0 ? (
        <PlaceholderCard
          title="Nothing to chart yet"
          body="Finish a few workouts and your progress for each exercise shows up here, with charts and personal records."
        />
      ) : (
        <View style={styles.sortRow}>
          <ThemedText type="small" themeColor="textSecondary">
            {rows.length} {rows.length === 1 ? 'exercise' : 'exercises'}
          </ThemedText>
          <View style={styles.chips}>
            <Chip label="Recent" selected={sort === 'recent'} onPress={() => setSort('recent')} />
            <Chip label="Most done" selected={sort === 'most'} onPress={() => setSort('most')} />
          </View>
        </View>
      )}

      {rows.map((row) => (
        <ProgressCard key={row.exerciseId} row={row} />
      ))}
    </Screen>
  );
}

function ProgressCard({ row }: { row: Row }) {
  const { exercise, sessions } = row;
  const kind = exercise?.kind ?? 'strength';
  const [headline] = metricsFor(kind, sessions);
  const values = sessions.map(headline.value);
  const best = Math.max(...values);
  const change = changeLabel(headline, sessions);
  const last = sessions[sessions.length - 1];
  // "last today" / "last yesterday" / "last Wed, Oct 14"
  const day = dayLabel(last.startedAt);
  const lastDone = day === 'Today' || day === 'Yesterday' ? day.toLowerCase() : day;

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/exercise-progress/[id]', params: { id: row.exerciseId } })}
      accessibilityRole="button"
      accessibilityLabel={`${exercise?.name ?? 'Exercise'} progress`}>
      {({ pressed }) => (
        <ThemedView type="backgroundElement" style={[styles.card, { opacity: pressed ? 0.75 : 1 }]}>
          <View style={styles.cardText}>
            <ThemedText style={styles.name} numberOfLines={1}>
              {exercise?.name ?? 'Unknown exercise'}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {sessions.length} {sessions.length === 1 ? 'session' : 'sessions'} · last {lastDone}
            </ThemedText>
            <View style={styles.valueRow}>
              <ThemedText style={styles.value}>{headline.format(best)}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                best {headline.label.toLowerCase()}
              </ThemedText>
            </View>
            {change ? (
              <ThemedText type="smallBold" themeColor={change.startsWith('+') ? 'accent' : 'textSecondary'}>
                {change} since first
              </ThemedText>
            ) : null}
          </View>
          <View style={styles.spark}>
            {values.length > 1 ? <LineChart values={values.slice(-SPARKLINE_SESSIONS)} height={56} compact /> : null}
          </View>
        </ThemedView>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sortRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chips: { flexDirection: 'row', gap: Spacing.two },
  card: { borderRadius: 16, padding: Spacing.three, flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  cardText: { flex: 1, gap: 2 },
  name: { fontSize: 17, lineHeight: 22, fontWeight: 700 },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.two, marginTop: Spacing.one },
  value: { fontSize: 22, lineHeight: 28, fontWeight: 800 },
  spark: { width: 96 },
});
