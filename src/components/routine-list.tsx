import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useMemo } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { PlaceholderCard } from '@/components/placeholder-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useStartRoutine } from '@/hooks/use-start-routine';
import { useTheme } from '@/hooks/use-theme';
import { useAllExercises } from '@/lib/custom-exercises';
import { dayLabel } from '@/lib/history';
import { createRoutine, type Routine } from '@/lib/routines';

/**
 * Your routines as cards (tap to edit, Start to begin). Shared by the
 * Routines tab and the Workout tab, which shows them instead when the Meds
 * tab has taken Routines' spot in the tab bar.
 */
export function RoutineList({ routines }: { routines: Routine[] }) {
  if (routines.length === 0) {
    return (
      <PlaceholderCard
        title="No routines yet"
        body="Save workouts like Push, Pull and Legs so you can start them in one tap. You can also save any finished workout as a routine from History."
      />
    );
  }
  return (
    <>
      {routines.map((r) => (
        <RoutineCard key={r.id} routine={r} />
      ))}
    </>
  );
}

/** Returns a function that makes a new, empty routine and opens it for editing. */
export function useNewRoutine() {
  const db = useSQLiteContext();
  return async function newRoutine() {
    try {
      const id = await createRoutine(db, 'New routine');
      router.push({ pathname: '/routine/[id]', params: { id, isNew: '1' } });
    } catch (err) {
      console.warn('Could not create routine', err);
      Alert.alert("Couldn't create routine", 'Something went wrong. Try again.');
    }
  };
}

function RoutineCard({ routine }: { routine: Routine }) {
  const theme = useTheme();
  const start = useStartRoutine();
  const exercises = useAllExercises();
  const names = useMemo(() => {
    const byId = new Map(exercises.map((e) => [e.id, e.name]));
    return routine.exercises.map((e) => byId.get(e.exercise_id) ?? 'Unknown exercise');
  }, [exercises, routine.exercises]);

  const totalSets = routine.exercises.reduce((n, e) => n + e.sets, 0);
  const count = routine.exercises.length;

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/routine/[id]', params: { id: routine.id } })}
      accessibilityRole="button"
      accessibilityLabel={`Edit ${routine.name}`}>
      {({ pressed }) => (
        <ThemedView type="backgroundElement" style={[styles.card, { opacity: pressed ? 0.8 : 1 }]}>
          <View style={styles.cardTop}>
            <View style={styles.flex}>
              <ThemedText style={styles.name} numberOfLines={1}>
                {routine.name}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {count} {count === 1 ? 'exercise' : 'exercises'} · {totalSets} {totalSets === 1 ? 'set' : 'sets'}
                {'  ·  '}
                {routine.last_used_at ? `last done ${lowerRelative(dayLabel(routine.last_used_at))}` : 'not done yet'}
              </ThemedText>
            </View>
            <Pressable
              onPress={() => start(routine.id)}
              disabled={count === 0}
              accessibilityRole="button"
              accessibilityLabel={`Start ${routine.name}`}
              hitSlop={6}
              style={({ pressed: p }) => [
                styles.start,
                { backgroundColor: theme.accent, opacity: count === 0 ? 0.4 : p ? 0.8 : 1 },
              ]}>
              <ThemedText type="smallBold" style={{ color: theme.onAccent }}>
                Start
              </ThemedText>
            </Pressable>
          </View>
          <ThemedText type="small" numberOfLines={2} style={styles.exerciseNames}>
            {count > 0 ? names.join(', ') : 'No exercises yet. Tap to add some.'}
          </ThemedText>
        </ThemedView>
      )}
    </Pressable>
  );
}

/** "Today" → "today", "Wed, Oct 14" stays as is. */
function lowerRelative(label: string) {
  return label === 'Today' || label === 'Yesterday' ? label.toLowerCase() : label;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { borderRadius: 16, padding: Spacing.three, gap: Spacing.two },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  name: { fontSize: 18, lineHeight: 24, fontWeight: 800 },
  start: { borderRadius: 999, paddingHorizontal: 18, paddingVertical: 8 },
  exerciseNames: { lineHeight: 20 },
});
