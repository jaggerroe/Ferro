import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';

import { newId } from '@/db/migrations';
import {
  EXERCISES,
  type Equipment,
  type Exercise,
  type ExerciseKind,
  type MuscleGroup,
} from '@/data/exercises';

/**
 * Exercises the user creates with the "New exercise" form, saved in the
 * on-device SQLite database (table `custom_exercises`).
 *
 * Screens read exercises through `useAllExercises()`, which re-loads
 * automatically whenever a custom exercise is added.
 */

// Tiny "something changed" signal so every screen showing exercises refreshes after a save.
let version = 0;
const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
const getVersion = () => version;
/** Tells every screen (and backup) that custom exercises changed. */
export function notifyCustomExercisesChanged() {
  version++;
  listeners.forEach((l) => l());
}

type CustomExerciseRow = {
  id: string;
  name: string;
  muscle: string;
  secondary: string;
  equipment: string;
  kind: string;
};

function rowToExercise(row: CustomExerciseRow): Exercise {
  let secondary: MuscleGroup[] = [];
  try {
    secondary = JSON.parse(row.secondary);
  } catch {
    // Bad JSON shouldn't crash the library; just show no secondary muscles.
  }
  return {
    id: row.id,
    name: row.name,
    muscle: row.muscle as MuscleGroup,
    secondary,
    equipment: row.equipment as Equipment,
    kind: row.kind as ExerciseKind,
    custom: true,
  };
}

export type NewExerciseInput = {
  name: string;
  muscle: MuscleGroup;
  secondary: MuscleGroup[];
  equipment: Equipment;
  kind: ExerciseKind;
};

/** True if an exercise with this name (ignoring capitals) is already in the list. */
export function exerciseNameTaken(name: string, all: Exercise[]) {
  const key = name.trim().toLowerCase();
  return all.some((e) => e.name.toLowerCase() === key);
}

/** Saves a new custom exercise to the database. */
export async function addCustomExercise(db: SQLiteDatabase, input: NewExerciseInput) {
  const name = input.name.trim();
  await db.runAsync(
    `INSERT INTO custom_exercises (id, name, muscle, secondary, equipment, kind, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    `custom-${newId()}`,
    name,
    input.muscle,
    JSON.stringify(input.secondary),
    input.equipment,
    input.kind,
    Date.now(),
  );
  notifyCustomExercisesChanged();
}

/** Ticks whenever custom exercises change. */
export function useCustomExercisesVersion() {
  return useSyncExternalStore(subscribe, getVersion, getVersion);
}

/** Only the user's custom exercises, loaded from the database. */
export function useCustomExercises(): Exercise[] {
  const db = useSQLiteContext();
  const changeCount = useSyncExternalStore(subscribe, getVersion, getVersion);
  const [custom, setCustom] = useState<Exercise[]>([]);

  useEffect(() => {
    let active = true;
    db.getAllAsync<CustomExerciseRow>(
      'SELECT id, name, muscle, secondary, equipment, kind FROM custom_exercises ORDER BY name',
    )
      .then((rows) => {
        if (active) setCustom(rows.map(rowToExercise));
      })
      .catch((err) => console.warn('Could not load custom exercises', err));
    return () => {
      active = false;
    };
  }, [db, changeCount]);

  return custom;
}

/** Built-in + custom exercises. */
export function useAllExercises(): Exercise[] {
  const custom = useCustomExercises();
  return useMemo(() => (custom.length ? [...EXERCISES, ...custom] : EXERCISES), [custom]);
}
