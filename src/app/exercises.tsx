import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useMemo, useState } from 'react';
import { Alert, Pressable, SectionList, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Chip } from '@/components/chip';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { type Exercise } from '@/data/exercises';
import { useAllExercises } from '@/lib/custom-exercises';
import { filterExercises, groupExercises, SORT_OPTIONS, type SortMode } from '@/lib/exercise-sort';
import { addExercisesToRoutine } from '@/lib/routines';
import { addExercisesToWorkout } from '@/lib/workouts';
import { useTheme } from '@/hooks/use-theme';

/**
 * The exercise library. Opened two ways:
 *  - from "Browse exercises": just a list to look through
 *  - from a workout's or routine's "Add exercises" (pick=1): tap to select, then "Add"
 */
export default function ExerciseLibraryScreen() {
  const theme = useTheme();
  const db = useSQLiteContext();
  const exercises = useAllExercises();
  const params = useLocalSearchParams<{ pick?: string; workoutId?: string; routineId?: string }>();
  const picking = params.pick === '1' && (!!params.workoutId || !!params.routineId);

  // Exercise ids picked so far, in the order they were tapped.
  const [picked, setPicked] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);

  function togglePicked(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  async function addPicked() {
    if (!picking || picked.length === 0 || adding) return;
    setAdding(true);
    try {
      if (params.workoutId) await addExercisesToWorkout(db, params.workoutId, picked);
      else if (params.routineId) await addExercisesToRoutine(db, params.routineId, picked);
      router.back();
    } catch (err) {
      console.warn('Could not add exercises', err);
      Alert.alert("Couldn't add exercises", 'Something went wrong. Try again.');
      setAdding(false);
    }
  }

  // "State": values this screen remembers. Changing them re-renders the screen.
  const [query, setQuery] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('muscle');

  // Recompute the sections only when the search text or sort mode changes.
  const filtered = useMemo(() => filterExercises(exercises, query), [exercises, query]);
  const sections = useMemo(() => groupExercises(filtered, sortMode), [filtered, sortMode]);

  /** The grey line under each name shows whatever the list ISN'T grouped by. */
  function detailFor(e: Exercise) {
    if (sortMode === 'muscle') return e.equipment;
    if (sortMode === 'equipment') return e.muscle;
    return `${e.muscle} · ${e.equipment}`;
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <View style={styles.topBar}>
        <ThemedText style={styles.heading}>{picking ? 'Add exercises' : 'Exercises'}</ThemedText>
        <View style={styles.barActions}>
          <Pressable
            onPress={() => router.push('/new-exercise')}
            accessibilityRole="button"
            accessibilityLabel="Create a new exercise"
            hitSlop={8}
            style={({ pressed }) => [
              styles.newButton,
              { backgroundColor: theme.accent, opacity: pressed ? 0.8 : 1 },
            ]}>
            <ThemedText type="smallBold" style={{ color: theme.onAccent }}>
              + New
            </ThemedText>
          </Pressable>
          <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={8}>
            <ThemedText
              type="smallBold"
              themeColor={picking ? 'textSecondary' : 'accent'}
              style={styles.done}>
              {picking ? 'Cancel' : 'Done'}
            </ThemedText>
          </Pressable>
        </View>
      </View>

      <View style={styles.controls}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={`Search ${exercises.length} exercises`}
          placeholderTextColor={theme.textSecondary}
          autoCorrect={false}
          clearButtonMode="while-editing"
          style={[styles.search, { backgroundColor: theme.backgroundElement, color: theme.text }]}
        />
        <View style={styles.chips}>
          <ThemedText type="small" themeColor="textSecondary">
            Group by
          </ThemedText>
          {SORT_OPTIONS.map((option) => (
            <Chip
              key={option.mode}
              label={option.label}
              selected={sortMode === option.mode}
              onPress={() => setSortMode(option.mode)}
            />
          ))}
        </View>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        stickySectionHeadersEnabled
        contentContainerStyle={styles.listContent}
        renderSectionHeader={({ section }) => (
          <View style={[styles.sectionHeader, { backgroundColor: theme.background }]}>
            <ThemedText type="smallBold" themeColor="accent" style={styles.sectionTitle}>
              {section.title}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {section.data.length}
            </ThemedText>
          </View>
        )}
        renderItem={({ item }) => {
          const order = picked.indexOf(item.id);
          const selected = order !== -1;
          return (
          <Pressable
            disabled={!picking}
            onPress={() => togglePicked(item.id)}
            accessibilityRole={picking ? 'checkbox' : undefined}
            accessibilityState={picking ? { checked: selected } : undefined}
            style={[
              styles.row,
              { borderBottomColor: theme.backgroundSelected },
              selected && { backgroundColor: `${theme.accent}22` },
            ]}>
            <View style={styles.rowText}>
            <View style={styles.nameRow}>
              <ThemedText style={styles.name}>{item.name}</ThemedText>
              {item.custom ? (
                <View style={[styles.badge, { backgroundColor: theme.backgroundSelected }]}>
                  <ThemedText type="smallBold" themeColor="textSecondary" style={styles.badgeText}>
                    Custom
                  </ThemedText>
                </View>
              ) : null}
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              {detailFor(item)}
              {item.secondary.length > 0 ? `  ·  also ${item.secondary.join(', ')}` : ''}
            </ThemedText>
            </View>
            {picking ? (
              <View
                style={[
                  styles.pickCircle,
                  selected
                    ? { backgroundColor: theme.accent, borderColor: theme.accent }
                    : { borderColor: theme.textSecondary },
                ]}>
                {selected ? (
                  <ThemedText type="smallBold" style={[styles.pickNumber, { color: theme.onAccent }]}>
                    {order + 1}
                  </ThemedText>
                ) : null}
              </View>
            ) : null}
          </Pressable>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <ThemedText themeColor="textSecondary" style={styles.emptyText}>
              No exercises match “{query}”.
            </ThemedText>
            <Pressable onPress={() => router.push('/new-exercise')} accessibilityRole="button" hitSlop={8}>
              <ThemedText type="smallBold" themeColor="accent">
                Create it as a new exercise
              </ThemedText>
            </Pressable>
          </View>
        }
      />

      {picking && picked.length > 0 ? (
        <SafeAreaView edges={['bottom']} style={[styles.addBar, { backgroundColor: theme.background }]}>
          <Pressable
            onPress={addPicked}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.addButton,
              { backgroundColor: theme.accent, opacity: pressed || adding ? 0.8 : 1 },
            ]}>
            <ThemedText style={[styles.addLabel, { color: theme.onAccent }]}>
              Add {picked.length} {picked.length === 1 ? 'exercise' : 'exercises'}
            </ThemedText>
          </Pressable>
        </SafeAreaView>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  heading: { fontSize: 20, lineHeight: 26, fontWeight: 800 },
  done: { fontSize: 16 },
  barActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  newButton: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  badge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  badgeText: { fontSize: 11, lineHeight: 16, textTransform: 'uppercase', letterSpacing: 0.5 },
  controls: { paddingHorizontal: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.two },
  search: {
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: 12,
    fontSize: 16,
  },
  chips: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' },
  listContent: { paddingBottom: Spacing.six },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.one,
  },
  sectionTitle: { textTransform: 'uppercase', letterSpacing: 1, fontSize: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: { flex: 1, gap: 2 },
  pickCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickNumber: { fontSize: 13, lineHeight: 16 },
  addBar: { paddingHorizontal: Spacing.three, paddingTop: Spacing.two },
  addButton: { borderRadius: 14, paddingVertical: Spacing.three, alignItems: 'center', marginBottom: Spacing.two },
  addLabel: { fontSize: 17, fontWeight: 800 },
  name: { fontSize: 17, lineHeight: 22, fontWeight: 600 },
  empty: { alignItems: 'center', padding: Spacing.five, gap: Spacing.two },
  emptyText: { textAlign: 'center' },
});
