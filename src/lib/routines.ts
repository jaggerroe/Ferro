import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { useEffect, useState } from 'react';

import { newId } from '@/db/migrations';
import { getActiveWorkout, notifyWorkoutsChanged, useWorkoutsVersion } from '@/lib/workouts';

/**
 * Routines: saved workout templates like "Push day". Each one is a list of
 * exercises with how many sets to start with. Starting a routine creates a
 * normal workout from it, and the "Previous" column fills in from last time.
 *
 * Routines share the workouts "something changed" signal, so every screen
 * showing either one refreshes together.
 */

export const MIN_SETS = 1;
export const MAX_SETS = 20;
export const DEFAULT_SETS = 3;

export type RoutineExercise = { id: string; exercise_id: string; position: number; sets: number };

export type Routine = {
  id: string;
  name: string;
  created_at: number;
  last_used_at: number | null;
  exercises: RoutineExercise[];
};

// ---- reading ----------------------------------------------------------------

/** All routines, most recently used (or created) first. */
export async function getRoutines(db: SQLiteDatabase): Promise<Routine[]> {
  const routines = await db.getAllAsync<Omit<Routine, 'exercises'>>(
    'SELECT * FROM routines ORDER BY COALESCE(last_used_at, created_at) DESC',
  );
  const rows = await db.getAllAsync<RoutineExercise & { routine_id: string }>(
    'SELECT * FROM routine_exercises ORDER BY routine_id, position',
  );
  return routines.map((r) => ({ ...r, exercises: rows.filter((x) => x.routine_id === r.id) }));
}

export function useRoutines() {
  const db = useSQLiteContext();
  const changes = useWorkoutsVersion();
  const [routines, setRoutines] = useState<Routine[] | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    getRoutines(db)
      .then((r) => alive && setRoutines(r))
      .catch((err) => console.warn('Could not load routines', err));
    return () => {
      alive = false;
    };
  }, [db, changes]);

  return routines;
}

/** One routine. `undefined` = loading, `null` = not found (e.g. deleted). */
export function useRoutine(routineId: string | undefined) {
  const db = useSQLiteContext();
  const changes = useWorkoutsVersion();
  const [routine, setRoutine] = useState<Routine | null | undefined>(undefined);

  useEffect(() => {
    if (!routineId) return;
    let alive = true;
    (async () => {
      const r = await db.getFirstAsync<Omit<Routine, 'exercises'>>('SELECT * FROM routines WHERE id = ?', routineId);
      const exercises = r
        ? await db.getAllAsync<RoutineExercise>(
            'SELECT id, exercise_id, position, sets FROM routine_exercises WHERE routine_id = ? ORDER BY position',
            routineId,
          )
        : [];
      if (alive) setRoutine(r ? { ...r, exercises } : null);
    })().catch((err) => console.warn('Could not load routine', err));
    return () => {
      alive = false;
    };
  }, [db, routineId, changes]);

  return routine;
}

// ---- writing ------------------------------------------------------------------

/** Creates a routine (optionally with exercises already in it) and returns its id. */
export async function createRoutine(
  db: SQLiteDatabase,
  name: string,
  exercises: { exercise_id: string; sets: number }[] = [],
) {
  const id = newId();
  await db.withTransactionAsync(async () => {
    await db.runAsync('INSERT INTO routines (id, name, created_at) VALUES (?, ?, ?)', id, name.trim() || 'New routine', Date.now());
    let position = 0;
    for (const e of exercises) {
      await db.runAsync(
        'INSERT INTO routine_exercises (id, routine_id, exercise_id, position, sets) VALUES (?, ?, ?, ?, ?)',
        newId(),
        id,
        e.exercise_id,
        position++,
        clampSets(e.sets),
      );
    }
  });
  notifyWorkoutsChanged();
  return id;
}

export async function renameRoutine(db: SQLiteDatabase, routineId: string, name: string) {
  await db.runAsync('UPDATE routines SET name = ? WHERE id = ?', name.trim() || 'New routine', routineId);
  notifyWorkoutsChanged();
}

export async function deleteRoutine(db: SQLiteDatabase, routineId: string) {
  await db.runAsync('DELETE FROM routines WHERE id = ?', routineId);
  notifyWorkoutsChanged();
}

/** Adds exercises to the end of a routine with the default number of sets. */
export async function addExercisesToRoutine(db: SQLiteDatabase, routineId: string, exerciseIds: string[]) {
  await db.withTransactionAsync(async () => {
    const row = await db.getFirstAsync<{ maxPos: number | null }>(
      'SELECT MAX(position) AS maxPos FROM routine_exercises WHERE routine_id = ?',
      routineId,
    );
    let position = (row?.maxPos ?? -1) + 1;
    for (const exerciseId of exerciseIds) {
      await db.runAsync(
        'INSERT INTO routine_exercises (id, routine_id, exercise_id, position, sets) VALUES (?, ?, ?, ?, ?)',
        newId(),
        routineId,
        exerciseId,
        position++,
        DEFAULT_SETS,
      );
    }
  });
  notifyWorkoutsChanged();
}

export async function setRoutineExerciseSets(db: SQLiteDatabase, routineExerciseId: string, sets: number) {
  await db.runAsync('UPDATE routine_exercises SET sets = ? WHERE id = ?', clampSets(sets), routineExerciseId);
  notifyWorkoutsChanged();
}

export async function removeRoutineExercise(db: SQLiteDatabase, routineExerciseId: string) {
  await db.runAsync('DELETE FROM routine_exercises WHERE id = ?', routineExerciseId);
  notifyWorkoutsChanged();
}

/** Moves an exercise one spot up (-1) or down (+1) in its routine. */
export async function moveRoutineExercise(db: SQLiteDatabase, routine: Routine, index: number, direction: -1 | 1) {
  const other = index + direction;
  if (other < 0 || other >= routine.exercises.length) return;
  const a = routine.exercises[index];
  const b = routine.exercises[other];
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE routine_exercises SET position = ? WHERE id = ?', b.position, a.id);
    await db.runAsync('UPDATE routine_exercises SET position = ? WHERE id = ?', a.position, b.id);
  });
  notifyWorkoutsChanged();
}

/** Thrown by startRoutine when a workout is already in progress. */
export class WorkoutInProgressError extends Error {
  constructor() {
    super('A workout is already in progress');
  }
}

/**
 * Starts a workout from a routine: same name, same exercises, and the right
 * number of empty sets for each. Returns the new workout's id.
 */
export async function startRoutine(db: SQLiteDatabase, routineId: string) {
  if (await getActiveWorkout(db)) throw new WorkoutInProgressError();

  const routine = await db.getFirstAsync<{ name: string }>('SELECT name FROM routines WHERE id = ?', routineId);
  if (!routine) throw new Error('Routine not found');
  const exercises = await db.getAllAsync<RoutineExercise>(
    'SELECT id, exercise_id, position, sets FROM routine_exercises WHERE routine_id = ? ORDER BY position',
    routineId,
  );

  const workoutId = newId();
  const now = Date.now();
  await db.withTransactionAsync(async () => {
    await db.runAsync('INSERT INTO workouts (id, name, started_at) VALUES (?, ?, ?)', workoutId, routine.name, now);
    let position = 0;
    for (const e of exercises) {
      const weId = newId();
      await db.runAsync(
        'INSERT INTO workout_exercises (id, workout_id, exercise_id, position) VALUES (?, ?, ?, ?)',
        weId,
        workoutId,
        e.exercise_id,
        position++,
      );
      for (let i = 0; i < e.sets; i++) {
        await db.runAsync('INSERT INTO sets (id, workout_exercise_id, position) VALUES (?, ?, ?)', newId(), weId, i);
      }
    }
    await db.runAsync('UPDATE routines SET last_used_at = ? WHERE id = ?', now, routineId);
  });
  notifyWorkoutsChanged();
  return workoutId;
}

/** Makes a routine from a finished workout: its exercises, in order, with the sets you did. */
export async function saveWorkoutAsRoutine(db: SQLiteDatabase, workoutId: string, name: string) {
  const rows = await db.getAllAsync<{ exercise_id: string; sets: number }>(
    `SELECT we.exercise_id, COUNT(s.id) AS sets
     FROM workout_exercises we
     LEFT JOIN sets s ON s.workout_exercise_id = we.id
     WHERE we.workout_id = ?
     GROUP BY we.id
     ORDER BY we.position`,
    workoutId,
  );
  return createRoutine(db, name, rows.map((r) => ({ exercise_id: r.exercise_id, sets: r.sets || DEFAULT_SETS })));
}

function clampSets(n: number) {
  return Math.min(MAX_SETS, Math.max(MIN_SETS, Math.round(n)));
}
