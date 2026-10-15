import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useMemo } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { ExerciseKind } from '@/data/exercises';
import { useAllExercises } from '@/lib/custom-exercises';
import { dayLabel, shortDuration, timeLabel, useWorkoutDetail, volumeLabel } from '@/lib/history';
import { discardWorkout, METERS_PER_MILE, type SetRow } from '@/lib/workouts';
import { useTheme } from '@/hooks/use-theme';

/** A finished workout, read-only: every exercise and set, plus totals. */
export default function WorkoutDetailScreen() {
  const theme = useTheme();
  const db = useSQLiteContext();
  const { id } = useLocalSearchParams<{ id: string }>();
  const workout = useWorkoutDetail(id);
  const exercises = useAllExercises();
  const exerciseById = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises]);

  const totals = useMemo(() => {
    const sets = workout?.blocks.flatMap((b) => b.sets) ?? [];
    const volume = sets.reduce((sum, s) => sum + (s.weight ?? 0) * (s.reps ?? 0), 0);
    return { sets: sets.length, volume };
  }, [workout]);

  function confirmDelete() {
    if (!workout) return;
    Alert.alert('Delete workout?', 'This removes it from your history for good.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await discardWorkout(db, workout.id);
          router.back();
        },
      },
    ]);
  }

  const topBar = (
    <View style={styles.topBar}>
      <ThemedText style={styles.heading}>Workout</ThemedText>
      <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={8}>
        <ThemedText type="smallBold" themeColor="accent" style={styles.done}>
          Done
        </ThemedText>
      </Pressable>
    </View>
  );

  if (!workout) {
    return (
      <SafeAreaView edges={['top']} style={[styles.safeArea, { backgroundColor: theme.background }]}>
        {topBar}
        {workout === null ? (
          <ThemedText themeColor="textSecondary" style={styles.missing}>
            This workout was deleted.
          </ThemedText>
        ) : null}
      </SafeAreaView>
    );
  }

  const durationSec = workout.finished_at ? (workout.finished_at - workout.started_at) / 1000 : 0;
  const timeRange = workout.finished_at
    ? `${timeLabel(workout.started_at)} – ${timeLabel(workout.finished_at)}`
    : timeLabel(workout.started_at);

  return (
    <SafeAreaView edges={['top']} style={[styles.safeArea, { backgroundColor: theme.background }]}>
      {topBar}
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.titleBlock}>
          <ThemedText style={styles.name}>{workout.name || 'Workout'}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {dayLabel(workout.started_at)}  ·  {timeRange}
          </ThemedText>
        </View>

        <View style={styles.stats}>
          <Stat label="Time" value={shortDuration(durationSec)} />
          <Stat label="Sets" value={String(totals.sets)} />
          <Stat label="Volume" value={volumeLabel(totals.volume) ?? '—'} />
        </View>

        {workout.blocks.map((block) => {
          const exercise = exerciseById.get(block.exercise_id);
          const kind: ExerciseKind = exercise?.kind ?? 'strength';
          const best = bestSetId(kind, block.sets);
          return (
            <ThemedView key={block.id} type="backgroundElement" style={styles.block}>
              <Pressable
                onPress={() => router.push({ pathname: '/exercise-progress/[id]', params: { id: block.exercise_id } })}
                accessibilityRole="button"
                accessibilityLabel={`${exercise?.name ?? 'Exercise'} progress`}
                hitSlop={6}
                style={styles.exerciseHeader}>
                <ThemedText style={[styles.exerciseName, styles.flex]}>{exercise?.name ?? 'Unknown exercise'}</ThemedText>
                <ThemedText type="smallBold" themeColor="accent">
                  Progress ›
                </ThemedText>
              </Pressable>
              {exercise ? (
                <ThemedText type="small" themeColor="textSecondary" style={styles.equipment}>
                  {exercise.equipment}
                </ThemedText>
              ) : null}
              {block.sets.map((s, i) => (
                <View
                  key={s.id}
                  style={[styles.setRow, i > 0 && { borderTopColor: theme.backgroundSelected, borderTopWidth: StyleSheet.hairlineWidth }]}>
                  <ThemedText type="smallBold" themeColor="textSecondary" style={styles.setNumber}>
                    {i + 1}
                  </ThemedText>
                  <ThemedText style={styles.setValue}>{describeSet(kind, s)}</ThemedText>
                  {s.id === best ? (
                    <View style={[styles.bestTag, { backgroundColor: `${theme.accent}22` }]}>
                      <ThemedText type="smallBold" themeColor="accent" style={styles.bestText}>
                        Best
                      </ThemedText>
                    </View>
                  ) : null}
                </View>
              ))}
            </ThemedView>
          );
        })}

        <Pressable onPress={confirmDelete} accessibilityRole="button" hitSlop={8} style={styles.delete}>
          <ThemedText type="smallBold" themeColor="danger">
            Delete workout
          </ThemedText>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <ThemedView type="backgroundElement" style={styles.stat}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </ThemedText>
    </ThemedView>
  );
}

const trim = (n: number) => String(Number(n.toFixed(2)));

/** "135 lb × 8", "12 reps", or "20 min · 2 mi" */
function describeSet(kind: ExerciseKind, s: SetRow) {
  if (kind === 'strength') return `${trim(s.weight ?? 0)} lb × ${s.reps ?? 0}`;
  if (kind === 'bodyweight') return `${s.reps ?? 0} reps`;
  const parts = [
    s.duration_sec !== null ? `${trim(s.duration_sec / 60)} min` : null,
    s.distance_m !== null ? `${trim(s.distance_m / METERS_PER_MILE)} mi` : null,
  ].filter(Boolean);
  return parts.join(' · ') || '—';
}

/**
 * The set to label "Best": heaviest weight for strength (more reps breaks a
 * tie), most reps for bodyweight, longest distance (or time) for cardio.
 * No label when there's only one set.
 */
function bestSetId(kind: ExerciseKind, sets: SetRow[]) {
  if (sets.length < 2) return null;
  const score = (s: SetRow) =>
    kind === 'strength'
      ? (s.weight ?? 0) * 1000 + (s.reps ?? 0)
      : kind === 'bodyweight'
        ? (s.reps ?? 0)
        : (s.distance_m ?? 0) * 100000 + (s.duration_sec ?? 0);
  return sets.reduce((best, s) => (score(s) > score(best) ? s : best)).id;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  flex: { flex: 1 },
  exerciseHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  heading: { fontSize: 20, lineHeight: 26, fontWeight: 800 },
  done: { fontSize: 16 },
  missing: { textAlign: 'center', padding: Spacing.five },
  body: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.six, gap: Spacing.three },
  titleBlock: { gap: 2 },
  name: { fontSize: 28, lineHeight: 34, fontWeight: 800 },
  stats: { flexDirection: 'row', gap: Spacing.two },
  stat: { flex: 1, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 12, gap: 2 },
  statValue: { fontSize: 18, lineHeight: 24, fontWeight: 800 },
  block: { borderRadius: 16, padding: Spacing.three },
  exerciseName: { fontSize: 17, lineHeight: 22, fontWeight: 700 },
  equipment: { marginBottom: Spacing.two },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: 8 },
  setNumber: { width: 20, textAlign: 'center' },
  setValue: { flex: 1, fontWeight: 600, fontVariant: ['tabular-nums'] },
  bestTag: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  bestText: { fontSize: 12, lineHeight: 16 },
  delete: { alignItems: 'center', paddingVertical: Spacing.three },
});
