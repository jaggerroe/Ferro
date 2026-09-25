import { EQUIPMENT, MUSCLE_GROUPS, type Exercise } from '@/data/exercises';

export type SortMode = 'muscle' | 'equipment' | 'alpha';

export const SORT_OPTIONS: { mode: SortMode; label: string }[] = [
  { mode: 'muscle', label: 'Muscle' },
  { mode: 'equipment', label: 'Equipment' },
  { mode: 'alpha', label: 'A–Z' },
];

export type ExerciseSection = { title: string; data: Exercise[] };

const byName = (a: Exercise, b: Exercise) => a.name.localeCompare(b.name);

/** Keeps exercises whose name, muscle or equipment contains the search text. */
export function filterExercises(list: Exercise[], query: string): Exercise[] {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  return list.filter(
    (e) =>
      e.name.toLowerCase().includes(q) ||
      e.muscle.toLowerCase().includes(q) ||
      e.equipment.toLowerCase().includes(q),
  );
}

/**
 * Splits exercises into titled sections for a SectionList.
 * - muscle:    one section per muscle group, in body order (Chest, Back, …)
 * - equipment: one section per equipment type
 * - alpha:     one section per first letter
 * Exercises inside each section are always A–Z, and empty sections are dropped.
 */
export function groupExercises(list: Exercise[], mode: SortMode): ExerciseSection[] {
  if (mode === 'alpha') {
    const buckets = new Map<string, Exercise[]>();
    for (const e of [...list].sort(byName)) {
      const letter = e.name[0].toUpperCase();
      const key = /[A-Z]/.test(letter) ? letter : '#';
      buckets.set(key, [...(buckets.get(key) ?? []), e]);
    }
    return [...buckets].map(([title, data]) => ({ title, data }));
  }

  const order: readonly string[] = mode === 'muscle' ? MUSCLE_GROUPS : EQUIPMENT;
  const keyOf = (e: Exercise) => (mode === 'muscle' ? e.muscle : e.equipment);

  return order
    .map((title) => ({ title, data: list.filter((e) => keyOf(e) === title).sort(byName) }))
    .filter((section) => section.data.length > 0);
}
