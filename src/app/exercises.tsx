import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, SectionList, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Chip } from '@/components/chip';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { EXERCISES, type Exercise } from '@/data/exercises';
import { filterExercises, groupExercises, SORT_OPTIONS, type SortMode } from '@/lib/exercise-sort';
import { useTheme } from '@/hooks/use-theme';

export default function ExerciseLibraryScreen() {
  const theme = useTheme();

  // "State": values this screen remembers. Changing them re-renders the screen.
  const [query, setQuery] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('muscle');

  // Recompute the sections only when the search text or sort mode changes.
  const filtered = useMemo(() => filterExercises(EXERCISES, query), [query]);
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
        <ThemedText style={styles.heading}>Exercises</ThemedText>
        <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={8}>
          <ThemedText type="smallBold" themeColor="accent" style={styles.done}>
            Done
          </ThemedText>
        </Pressable>
      </View>

      <View style={styles.controls}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={`Search ${EXERCISES.length} exercises`}
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
        renderItem={({ item }) => (
          <View style={[styles.row, { borderBottomColor: theme.backgroundSelected }]}>
            <ThemedText style={styles.name}>{item.name}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {detailFor(item)}
              {item.secondary.length > 0 ? `  ·  also ${item.secondary.join(', ')}` : ''}
            </ThemedText>
          </View>
        )}
        ListEmptyComponent={
          <ThemedText themeColor="textSecondary" style={styles.empty}>
            No exercises match “{query}”.
          </ThemedText>
        }
      />
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
    paddingHorizontal: Spacing.three,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 2,
  },
  name: { fontSize: 17, lineHeight: 22, fontWeight: 600 },
  empty: { textAlign: 'center', padding: Spacing.five },
});
