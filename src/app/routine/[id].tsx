import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useStartRoutine } from '@/hooks/use-start-routine';
import { useTheme } from '@/hooks/use-theme';
import { useAllExercises } from '@/lib/custom-exercises';
import {
  deleteRoutine,
  MAX_SETS,
  MIN_SETS,
  moveRoutineExercise,
  removeRoutineExercise,
  renameRoutine,
  setRoutineExerciseSets,
  useRoutine,
} from '@/lib/routines';

/** Edit a routine: its name, exercises, order and sets. Also where you start it. */
export default function RoutineEditorScreen() {
  const theme = useTheme();
  const db = useSQLiteContext();
  const { id, isNew } = useLocalSearchParams<{ id: string; isNew?: string }>();
  const routine = useRoutine(id);
  const start = useStartRoutine();
  const exercises = useAllExercises();
  const exerciseById = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises]);

  const [name, setName] = useState('');
  const loadedName = useRef(false);
  useEffect(() => {
    if (routine && !loadedName.current) {
      // A brand-new routine starts with an empty box (placeholder "New routine").
      setName(isNew === '1' ? '' : routine.name);
      loadedName.current = true;
    }
  }, [routine, isNew]);

  function saveName() {
    if (routine) renameRoutine(db, routine.id, name).catch((err) => console.warn('Could not rename routine', err));
  }

  /** Leaving a brand-new routine with nothing in it throws it away, so you don't collect empty ones. */
  async function done() {
    if (isNew === '1' && routine && routine.exercises.length === 0 && name.trim() === '') {
      await deleteRoutine(db, routine.id);
    } else {
      saveName();
    }
    router.back();
  }

  function addExercises() {
    if (!routine) return;
    saveName();
    router.push({ pathname: '/exercises', params: { pick: '1', routineId: routine.id } });
  }

  function confirmDelete() {
    if (!routine) return;
    Alert.alert(`Delete "${routine.name}"?`, 'Your past workouts stay in History.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteRoutine(db, routine.id);
          router.back();
        },
      },
    ]);
  }

  async function startNow() {
    if (!routine) return;
    saveName();
    router.back();
    await start(routine.id);
  }

  const topBar = (
    <View style={styles.topBar}>
      <ThemedText style={styles.heading}>{isNew === '1' ? 'New routine' : 'Edit routine'}</ThemedText>
      <Pressable onPress={done} accessibilityRole="button" hitSlop={8}>
        <ThemedText type="smallBold" themeColor="accent" style={styles.done}>
          Done
        </ThemedText>
      </Pressable>
    </View>
  );

  if (!routine) {
    return (
      <SafeAreaView edges={['top']} style={[styles.safeArea, { backgroundColor: theme.background }]}>
        {topBar}
        {routine === null ? (
          <ThemedText themeColor="textSecondary" style={styles.missing}>
            This routine was deleted.
          </ThemedText>
        ) : null}
      </SafeAreaView>
    );
  }

  const count = routine.exercises.length;

  return (
    <SafeAreaView edges={['top']} style={[styles.safeArea, { backgroundColor: theme.background }]}>
      {topBar}
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <TextInput
          value={name}
          onChangeText={setName}
          onEndEditing={saveName}
          placeholder="Routine name, like Push day"
          placeholderTextColor={theme.textSecondary}
          autoFocus={isNew === '1'}
          autoCapitalize="words"
          returnKeyType="done"
          maxLength={40}
          style={[styles.nameInput, { color: theme.text, borderBottomColor: theme.backgroundSelected }]}
        />

        {count === 0 ? (
          <ThemedView type="backgroundElement" style={styles.emptyCard}>
            <ThemedText style={styles.emptyTitle}>Add exercises</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Pick the exercises for this routine and how many sets of each. When you start it, Ferro fills in your
              numbers from last time.
            </ThemedText>
          </ThemedView>
        ) : (
          <ThemedView type="backgroundElement" style={styles.list}>
            {routine.exercises.map((re, i) => {
              const exercise = exerciseById.get(re.exercise_id);
              return (
                <View
                  key={re.id}
                  style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.backgroundSelected }]}>
                  <View style={styles.order}>
                    <SmallButton label="▲" a11y="Move up" disabled={i === 0} onPress={() => moveRoutineExercise(db, routine, i, -1)} />
                    <SmallButton label="▼" a11y="Move down" disabled={i === count - 1} onPress={() => moveRoutineExercise(db, routine, i, 1)} />
                  </View>

                  <View style={styles.flex}>
                    <ThemedText style={styles.exerciseName} numberOfLines={1}>
                      {exercise?.name ?? 'Unknown exercise'}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                      {exercise?.equipment ?? ''}
                    </ThemedText>
                  </View>

                  <View style={styles.stepper}>
                    <SmallButton
                      label="−"
                      a11y="One less set"
                      disabled={re.sets <= MIN_SETS}
                      onPress={() => setRoutineExerciseSets(db, re.id, re.sets - 1)}
                    />
                    <ThemedText type="smallBold" style={styles.sets}>
                      {re.sets} {re.sets === 1 ? 'set' : 'sets'}
                    </ThemedText>
                    <SmallButton
                      label="+"
                      a11y="One more set"
                      disabled={re.sets >= MAX_SETS}
                      onPress={() => setRoutineExerciseSets(db, re.id, re.sets + 1)}
                    />
                  </View>

                  <Pressable
                    onPress={() => removeRoutineExercise(db, re.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${exercise?.name ?? 'exercise'}`}
                    hitSlop={8}>
                    <ThemedText themeColor="textSecondary" style={styles.remove}>
                      ✕
                    </ThemedText>
                  </Pressable>
                </View>
              );
            })}
          </ThemedView>
        )}

        <Pressable
          onPress={addExercises}
          accessibilityRole="button"
          style={({ pressed }) => [styles.addButton, { borderColor: theme.accent, opacity: pressed ? 0.7 : 1 }]}>
          <ThemedText type="smallBold" themeColor="accent" style={styles.addLabel}>
            + Add exercises
          </ThemedText>
        </Pressable>

        {count > 0 ? (
          <Pressable
            onPress={startNow}
            accessibilityRole="button"
            style={({ pressed }) => [styles.startButton, { backgroundColor: theme.accent, opacity: pressed ? 0.8 : 1 }]}>
            <ThemedText style={[styles.startLabel, { color: theme.onAccent }]}>Start this routine</ThemedText>
          </Pressable>
        ) : null}

        {isNew !== '1' ? (
          <Pressable onPress={confirmDelete} accessibilityRole="button" hitSlop={8} style={styles.delete}>
            <ThemedText type="smallBold" themeColor="danger">
              Delete routine
            </ThemedText>
          </Pressable>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function SmallButton({
  label,
  a11y,
  onPress,
  disabled = false,
}: {
  label: string;
  a11y: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      hitSlop={4}
      style={({ pressed }) => [
        styles.small,
        { backgroundColor: theme.backgroundSelected, opacity: disabled ? 0.35 : pressed ? 0.7 : 1 },
      ]}>
      <ThemedText type="smallBold" style={styles.smallLabel}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  flex: { flex: 1 },
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
  nameInput: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '800',
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  emptyCard: { borderRadius: 16, padding: Spacing.three, gap: Spacing.one },
  emptyTitle: { fontSize: 17, fontWeight: 700 },
  list: { borderRadius: 16, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.two, paddingVertical: 10 },
  order: { gap: 4 },
  exerciseName: { fontSize: 16, lineHeight: 21, fontWeight: 700 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sets: { minWidth: 46, textAlign: 'center' },
  remove: { fontSize: 16, paddingHorizontal: 4 },
  small: { width: 28, height: 26, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  smallLabel: { fontSize: 13, lineHeight: 16 },
  addButton: { borderWidth: 1.5, borderRadius: 14, paddingVertical: Spacing.three, alignItems: 'center' },
  addLabel: { fontSize: 16 },
  startButton: { borderRadius: 14, paddingVertical: Spacing.three, alignItems: 'center' },
  startLabel: { fontSize: 17, fontWeight: 800 },
  delete: { alignItems: 'center', paddingVertical: Spacing.three },
});
