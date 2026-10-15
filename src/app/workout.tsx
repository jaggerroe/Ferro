import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RestBar } from '@/components/rest-timer';
import { describeDraft, SetHeader, SetRow, type SetDraft } from '@/components/set-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { Exercise, ExerciseKind } from '@/data/exercises';
import { useAllExercises } from '@/lib/custom-exercises';
import { findNewPRs } from '@/lib/progress';
import {
  addSet,
  deleteSet,
  discardWorkout,
  finishWorkout,
  formatDuration,
  getActiveWorkout,
  getPreviousSets,
  getWorkoutBlocks,
  METERS_PER_MILE,
  removeExerciseFromWorkout,
  renameWorkout,
  setCompleted,
  updateSetFields,
  useWorkoutsVersion,
  type SetFields,
  type SetRow as SetRowData,
  type WorkoutExerciseBlock,
  type WorkoutSummary,
} from '@/lib/workouts';
import { useTheme } from '@/hooks/use-theme';

const EMPTY_DRAFT: SetDraft = { weight: '', reps: '', minutes: '', miles: '' };

export default function ActiveWorkoutScreen() {
  const theme = useTheme();
  // Space taken by the notch/status bar and the home indicator. Applied as
  // padding by hand because SafeAreaView doesn't always pick these up in a
  // full-screen modal.
  const insets = useSafeAreaInsets();
  const db = useSQLiteContext();
  const changes = useWorkoutsVersion();
  const allExercises = useAllExercises();
  const exerciseById = useMemo(() => new Map(allExercises.map((e) => [e.id, e])), [allExercises]);

  const [workout, setWorkout] = useState<WorkoutSummary | null>(null);
  const [name, setName] = useState('');
  const [blocks, setBlocks] = useState<WorkoutExerciseBlock[]>([]);
  // What's typed in each set's boxes, keyed by set id.
  const [drafts, setDrafts] = useState<Record<string, SetDraft>>({});
  const [previous, setPrevious] = useState<Record<string, SetDraft[]>>({});
  const loadedName = useRef(false);
  // Set when this screen closes itself, so the loader below doesn't also try to close it.
  const leaving = useRef(false);

  // Load (and re-load after any change) the workout in progress.
  useEffect(() => {
    let alive = true;
    (async () => {
      const w = await getActiveWorkout(db);
      if (!alive) return;
      if (!w) {
        // Finished or discarded somewhere else; nothing to show.
        if (!leaving.current) close();
        return;
      }
      const b = await getWorkoutBlocks(db, w.id);
      const prev = await getPreviousSets(db, b.map((x) => x.exercise_id), w.id);
      if (!alive) return;
      setWorkout(w);
      if (!loadedName.current) {
        setName(w.name ?? '');
        loadedName.current = true;
      }
      setBlocks(b);
      // Keep anything already typed; fill in drafts for new sets from the database.
      setDrafts((old) => {
        const next: Record<string, SetDraft> = {};
        for (const block of b) for (const s of block.sets) next[s.id] = old[s.id] ?? rowToDraft(s);
        return next;
      });
      const prevDrafts: Record<string, SetDraft[]> = {};
      for (const [exerciseId, rows] of Object.entries(prev)) prevDrafts[exerciseId] = rows.map(rowToDraft);
      setPrevious(prevDrafts);
    })().catch((err) => console.warn('Could not load workout', err));
    return () => {
      alive = false;
    };
  }, [db, changes]);

  const elapsed = useElapsedSeconds(workout?.started_at);

  const kindOf = (exerciseId: string): ExerciseKind => exerciseById.get(exerciseId)?.kind ?? 'strength';

  function changeDraft(setId: string, kind: ExerciseKind, draft: SetDraft) {
    setDrafts((d) => ({ ...d, [setId]: draft }));
    updateSetFields(db, setId, draftToFields(kind, draft)).catch((err) => console.warn('Could not save set', err));
  }

  function toggleComplete(block: WorkoutExerciseBlock, set: SetRowData, index: number) {
    const kind = kindOf(block.exercise_id);
    const done = set.completed === 1;
    let draft = drafts[set.id] ?? EMPTY_DRAFT;

    if (!done) {
      // Empty boxes take last time's numbers (the greyed-out placeholders).
      const prev = previous[block.exercise_id]?.[index];
      if (prev) {
        draft = {
          weight: draft.weight || prev.weight,
          reps: draft.reps || prev.reps,
          minutes: draft.minutes || prev.minutes,
          miles: draft.miles || prev.miles,
        };
      }
      const missing = missingField(kind, draft);
      if (missing) {
        Alert.alert(`Enter ${missing} first`, 'Fill in the set, then check it off.');
        return;
      }
    }

    setDrafts((d) => ({ ...d, [set.id]: draft }));
    setBlocks((bs) =>
      bs.map((b) =>
        b.id !== block.id
          ? b
          : { ...b, sets: b.sets.map((s) => (s.id === set.id ? { ...s, completed: done ? 0 : 1 } : s)) },
      ),
    );
    setCompleted(db, set.id, !done, draftToFields(kind, draft)).catch((err) =>
      console.warn('Could not update set', err),
    );
  }

  function confirmDeleteSet(setId: string, index: number) {
    Alert.alert(`Delete set ${index + 1}?`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteSet(db, setId) },
    ]);
  }

  function exerciseMenu(block: WorkoutExerciseBlock, exerciseName: string) {
    Alert.alert(exerciseName, undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove exercise',
        style: 'destructive',
        onPress: () => removeExerciseFromWorkout(db, block.id),
      },
    ]);
  }

  function saveName() {
    if (workout) renameWorkout(db, workout.id, name).catch((err) => console.warn('Could not rename', err));
  }

  function addExercises() {
    if (!workout) return;
    router.push({ pathname: '/exercises', params: { pick: '1', workoutId: workout.id } });
  }

  function confirmFinish() {
    if (!workout) return;
    const allSets = blocks.flatMap((b) => b.sets);
    const doneCount = allSets.filter((s) => s.completed === 1).length;

    if (doneCount === 0) {
      Alert.alert('No sets logged yet', 'Check off at least one set to save this workout.', [
        { text: 'Keep going', style: 'cancel' },
        { text: 'Discard workout', style: 'destructive', onPress: doDiscard },
      ]);
      return;
    }

    const unchecked = allSets.length - doneCount;
    Alert.alert(
      'Finish workout?',
      unchecked > 0 ? `${unchecked} unchecked ${unchecked === 1 ? 'set' : 'sets'} will be removed.` : undefined,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Finish', onPress: doFinish },
      ],
    );
  }

  async function doFinish() {
    if (!workout) return;
    saveName();
    leaving.current = true;
    try {
      const s = await finishWorkout(db, workout.id);
      close();
      const parts = [
        `${s.exercises} ${s.exercises === 1 ? 'exercise' : 'exercises'}`,
        `${s.sets} ${s.sets === 1 ? 'set' : 'sets'}`,
        formatDuration(s.durationSec),
      ];
      if (s.volume > 0) parts.push(`${Math.round(s.volume).toLocaleString()} lb lifted`);

      // Any records this workout broke, e.g. "Bench Press: heaviest weight 185 lb × 5".
      const prs = await findNewPRs(db, workout.id, kindOf).catch((err) => {
        console.warn('Could not check PRs', err);
        return [];
      });
      const prLines = prs.map(
        (p) => `${exerciseById.get(p.exerciseId)?.name ?? 'Exercise'}: ${p.label.toLowerCase()} ${p.value}`,
      );
      if (prLines.length > 0) {
        Alert.alert(
          `${prLines.length} new ${prLines.length === 1 ? 'PR' : 'PRs'}!`,
          `${prLines.join('\n')}\n\n${parts.join(' · ')}`,
        );
      } else {
        Alert.alert('Workout saved', parts.join(' · '));
      }
    } catch (err) {
      leaving.current = false;
      console.warn('Could not finish workout', err);
      Alert.alert("Couldn't save workout", 'Something went wrong. Try again.');
    }
  }

  function confirmDiscard() {
    Alert.alert('Discard workout?', "Everything you've logged in this workout will be deleted.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: doDiscard },
    ]);
  }

  async function doDiscard() {
    if (!workout) return;
    leaving.current = true;
    await discardWorkout(db, workout.id);
    close();
  }

  return (
    <View
      style={[
        styles.safeArea,
        {
          backgroundColor: theme.background,
          paddingTop: insets.top + Spacing.two,
          // The rest bar at the bottom handles the home-indicator spacing itself.
        },
      ]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Minimize workout" hitSlop={8}>
          <ThemedText themeColor="textSecondary" style={styles.barButton}>
            Hide
          </ThemedText>
        </Pressable>
        <ThemedText type="smallBold" themeColor="accent" style={styles.timer} accessibilityLabel="Elapsed time">
          {formatDuration(elapsed)}
        </ThemedText>
        <Pressable
          onPress={confirmFinish}
          accessibilityRole="button"
          hitSlop={8}
          style={({ pressed }) => [styles.finish, { backgroundColor: theme.accent, opacity: pressed ? 0.8 : 1 }]}>
          <ThemedText type="smallBold" style={{ color: theme.onAccent }}>
            Finish
          </ThemedText>
        </Pressable>
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag">
          <TextInput
            value={name}
            onChangeText={setName}
            onEndEditing={saveName}
            placeholder="Workout name"
            placeholderTextColor={theme.textSecondary}
            returnKeyType="done"
            maxLength={40}
            style={[styles.nameInput, { color: theme.text }]}
          />

          {blocks.length === 0 ? (
            <ThemedView type="backgroundElement" style={styles.emptyCard}>
              <ThemedText style={styles.emptyTitle}>Add your first exercise</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Pick from the library or make your own. Your sets save as you go.
              </ThemedText>
            </ThemedView>
          ) : null}

          {blocks.map((block) => {
            const exercise = exerciseById.get(block.exercise_id);
            const kind = kindOf(block.exercise_id);
            const exerciseName = exercise?.name ?? 'Unknown exercise';
            const prev = previous[block.exercise_id];
            return (
              <ThemedView key={block.id} type="backgroundElement" style={styles.block}>
                <View style={styles.blockHeader}>
                  <View style={styles.flex}>
                    <ThemedText style={styles.exerciseName} numberOfLines={1}>
                      {exerciseName}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                      {subtitleFor(exercise, prev, kind)}
                    </ThemedText>
                  </View>
                  <Pressable
                    onPress={() => exerciseMenu(block, exerciseName)}
                    accessibilityRole="button"
                    accessibilityLabel={`Options for ${exerciseName}`}
                    hitSlop={10}>
                    <ThemedText themeColor="textSecondary" style={styles.more}>
                      •••
                    </ThemedText>
                  </Pressable>
                </View>

                <SetHeader kind={kind} />
                {block.sets.map((set, i) => (
                  <SetRow
                    key={set.id}
                    index={i}
                    kind={kind}
                    draft={drafts[set.id] ?? EMPTY_DRAFT}
                    previous={prev?.[i]}
                    completed={set.completed === 1}
                    onChange={(d) => changeDraft(set.id, kind, d)}
                    onToggleComplete={() => toggleComplete(block, set, i)}
                    onLongPress={() => confirmDeleteSet(set.id, i)}
                  />
                ))}

                <Pressable
                  onPress={() => addSet(db, block.id)}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.addSet,
                    { backgroundColor: theme.backgroundSelected, opacity: pressed ? 0.7 : 1 },
                  ]}>
                  <ThemedText type="smallBold">+ Add set</ThemedText>
                </Pressable>
              </ThemedView>
            );
          })}

          <Pressable
            onPress={addExercises}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.addExercises,
              { borderColor: theme.accent, opacity: pressed ? 0.7 : 1 },
            ]}>
            <ThemedText type="smallBold" themeColor="accent" style={styles.addExercisesLabel}>
              + Add exercises
            </ThemedText>
          </Pressable>

          {blocks.length > 0 ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.tip}>
              Tip: press and hold a set to delete it.
            </ThemedText>
          ) : null}

          <Pressable onPress={confirmDiscard} accessibilityRole="button" hitSlop={8} style={styles.discard}>
            <ThemedText type="smallBold" themeColor="danger">
              Discard workout
            </ThemedText>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Start it yourself when you want; tap the time to change it. */}
      <RestBar bottomInset={insets.bottom} />
    </View>
  );
}

/** Closes this screen and goes back to the tabs. */
function close() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/** Seconds since `startedAt`, ticking once a second. */
function useElapsedSeconds(startedAt?: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return startedAt ? Math.round((now - startedAt) / 1000) : 0;
}

/** "Barbell · Last time 135 × 8" */
function subtitleFor(exercise: Exercise | undefined, prev: SetDraft[] | undefined, kind: ExerciseKind) {
  const equipment = exercise?.equipment ?? '';
  const best = prev?.[0];
  return best ? `${equipment} · Last time ${describeDraft(kind, best)}` : equipment;
}

function missingField(kind: ExerciseKind, d: SetDraft) {
  if (kind === 'strength') return !d.weight ? 'a weight' : !d.reps ? 'reps' : null;
  if (kind === 'bodyweight') return !d.reps ? 'reps' : null;
  return !d.minutes && !d.miles ? 'a time or distance' : null;
}

function toNumber(text: string) {
  const n = parseFloat(text);
  return Number.isFinite(n) ? n : null;
}

/** Strips trailing zeros: 2.50 → "2.5", 3.00 → "3" */
function trimNumber(n: number, decimals = 2) {
  return String(Number(n.toFixed(decimals)));
}

function draftToFields(kind: ExerciseKind, d: SetDraft): SetFields {
  const minutes = toNumber(d.minutes);
  const miles = toNumber(d.miles);
  const reps = toNumber(d.reps);
  return {
    weight: kind === 'strength' ? toNumber(d.weight) : null,
    reps: kind === 'cardio' || reps === null ? null : Math.round(reps),
    duration_sec: kind === 'cardio' && minutes !== null ? Math.round(minutes * 60) : null,
    distance_m: kind === 'cardio' && miles !== null ? miles * METERS_PER_MILE : null,
  };
}

function rowToDraft(s: SetRowData): SetDraft {
  return {
    weight: s.weight !== null ? trimNumber(s.weight) : '',
    reps: s.reps !== null ? String(s.reps) : '',
    minutes: s.duration_sec !== null ? trimNumber(s.duration_sec / 60) : '',
    miles: s.distance_m !== null ? trimNumber(s.distance_m / METERS_PER_MILE) : '',
  };
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  flex: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  barButton: { fontSize: 16 },
  timer: { fontSize: 16, fontVariant: ['tabular-nums'] },
  finish: { borderRadius: 999, paddingHorizontal: 16, paddingVertical: 7 },
  body: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.six, gap: Spacing.three },
  nameInput: { fontSize: 28, lineHeight: 34, fontWeight: '800', paddingVertical: Spacing.one },
  emptyCard: { borderRadius: 16, padding: Spacing.three, gap: Spacing.one },
  emptyTitle: { fontSize: 17, fontWeight: '700' },
  block: { borderRadius: 16, paddingVertical: Spacing.three, paddingHorizontal: Spacing.two, gap: 2 },
  blockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingBottom: Spacing.two,
  },
  exerciseName: { fontSize: 17, lineHeight: 22, fontWeight: '700' },
  more: { fontSize: 16, letterSpacing: 1 },
  addSet: { marginTop: Spacing.two, marginHorizontal: Spacing.two, borderRadius: 10, paddingVertical: 9, alignItems: 'center' },
  addExercises: { borderWidth: 1.5, borderRadius: 14, paddingVertical: Spacing.three, alignItems: 'center' },
  addExercisesLabel: { fontSize: 16 },
  tip: { textAlign: 'center' },
  discard: { alignItems: 'center', paddingVertical: Spacing.three },
});
