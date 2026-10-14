import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { useEffect, useState, useSyncExternalStore } from 'react';

import { newId } from '@/db/migrations';

/**
 * Everything about logging workouts: starting one, adding exercises and
 * sets, and finishing or discarding it. Every change is written to SQLite
 * right away, so a workout in progress survives the app being closed.
 *
 * Units: weight is stored as entered (lb for now). Cardio time is stored in
 * seconds and distance in meters; the screen converts to minutes and miles.
 */

// ---- "something changed" signal ------------------------------------------
// Screens that show workout data re-load when this ticks.

let version = 0;
const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
const getVersion = () => version;
export function notifyWorkoutsChanged() {
  version++;
  listeners.forEach((l) => l());
}
export function useWorkoutsVersion() {
  return useSyncExternalStore(subscribe, getVersion, getVersion);
}

// ---- types ----------------------------------------------------------------

export type WorkoutSummary = {
  id: string;
  name: string | null;
  started_at: number;
  finished_at: number | null;
};

export type SetRow = {
  id: string;
  workout_exercise_id: string;
  position: number;
  weight: number | null;
  reps: number | null;
  duration_sec: number | null;
  distance_m: number | null;
  completed: number; // 0 or 1 (SQLite has no booleans)
};

export type SetFields = Pick<SetRow, 'weight' | 'reps' | 'duration_sec' | 'distance_m'>;

export type WorkoutExerciseBlock = {
  id: string; // workout_exercises.id
  exercise_id: string;
  position: number;
  sets: SetRow[];
};

// ---- reading ----------------------------------------------------------------

/** The workout currently in progress, if any (finished_at is NULL). */
export async function getActiveWorkout(db: SQLiteDatabase) {
  return db.getFirstAsync<WorkoutSummary>(
    'SELECT id, name, started_at, finished_at FROM workouts WHERE finished_at IS NULL ORDER BY started_at DESC LIMIT 1',
  );
}

/** One workout with its exercises (in order) and each exercise's sets (in order). */
export async function getWorkoutBlocks(db: SQLiteDatabase, workoutId: string) {
  const exercises = await db.getAllAsync<Omit<WorkoutExerciseBlock, 'sets'>>(
    'SELECT id, exercise_id, position FROM workout_exercises WHERE workout_id = ? ORDER BY position',
    workoutId,
  );
  const sets = await db.getAllAsync<SetRow>(
    `SELECT s.* FROM sets s
     JOIN workout_exercises we ON we.id = s.workout_exercise_id
     WHERE we.workout_id = ?
     ORDER BY s.position`,
    workoutId,
  );
  return exercises.map((we) => ({
    ...we,
    sets: sets.filter((s) => s.workout_exercise_id === we.id),
  }));
}

/**
 * For each exercise, the completed sets from the most recent *finished*
 * workout that included it. Shown in the "Previous" column.
 */
export async function getPreviousSets(db: SQLiteDatabase, exerciseIds: string[], excludeWorkoutId: string) {
  const result: Record<string, SetRow[]> = {};
  for (const exerciseId of new Set(exerciseIds)) {
    const last = await db.getFirstAsync<{ id: string }>(
      `SELECT we.id FROM workout_exercises we
       JOIN workouts w ON w.id = we.workout_id
       WHERE we.exercise_id = ? AND w.finished_at IS NOT NULL AND w.id != ?
       ORDER BY w.started_at DESC, we.position DESC
       LIMIT 1`,
      exerciseId,
      excludeWorkoutId,
    );
    if (!last) continue;
    result[exerciseId] = await db.getAllAsync<SetRow>(
      'SELECT * FROM sets WHERE workout_exercise_id = ? AND completed = 1 ORDER BY position',
      last.id,
    );
  }
  return result;
}

/** Re-loads the active workout whenever any workout data changes. `undefined` = still loading. */
export function useActiveWorkout() {
  const db = useSQLiteContext();
  const changes = useWorkoutsVersion();
  const [active, setActive] = useState<WorkoutSummary | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    getActiveWorkout(db)
      .then((w) => alive && setActive(w ?? null))
      .catch((err) => console.warn('Could not load active workout', err));
    return () => {
      alive = false;
    };
  }, [db, changes]);

  return active;
}

// ---- writing ------------------------------------------------------------------

/** "Morning workout", "Afternoon workout" or "Evening workout". */
export function defaultWorkoutName(date = new Date()) {
  const h = date.getHours();
  if (h < 12) return 'Morning workout';
  if (h < 17) return 'Afternoon workout';
  return 'Evening workout';
}

/** Starts a new workout, or returns the one already in progress. */
export async function startWorkout(db: SQLiteDatabase) {
  const existing = await getActiveWorkout(db);
  if (existing) return existing.id;
  const id = newId();
  await db.runAsync(
    'INSERT INTO workouts (id, name, started_at) VALUES (?, ?, ?)',
    id,
    defaultWorkoutName(),
    Date.now(),
  );
  notifyWorkoutsChanged();
  return id;
}

export async function renameWorkout(db: SQLiteDatabase, workoutId: string, name: string) {
  await db.runAsync('UPDATE workouts SET name = ? WHERE id = ?', name.trim() || null, workoutId);
  notifyWorkoutsChanged();
}

/** Adds exercises to the end of the workout, each starting with one empty set. */
export async function addExercisesToWorkout(db: SQLiteDatabase, workoutId: string, exerciseIds: string[]) {
  await db.withTransactionAsync(async () => {
    const row = await db.getFirstAsync<{ maxPos: number | null }>(
      'SELECT MAX(position) AS maxPos FROM workout_exercises WHERE workout_id = ?',
      workoutId,
    );
    let position = (row?.maxPos ?? -1) + 1;
    for (const exerciseId of exerciseIds) {
      const weId = newId();
      await db.runAsync(
        'INSERT INTO workout_exercises (id, workout_id, exercise_id, position) VALUES (?, ?, ?, ?)',
        weId,
        workoutId,
        exerciseId,
        position++,
      );
      await db.runAsync('INSERT INTO sets (id, workout_exercise_id, position) VALUES (?, ?, 0)', newId(), weId);
    }
  });
  notifyWorkoutsChanged();
}

export async function removeExerciseFromWorkout(db: SQLiteDatabase, workoutExerciseId: string) {
  // Its sets are deleted automatically (ON DELETE CASCADE).
  await db.runAsync('DELETE FROM workout_exercises WHERE id = ?', workoutExerciseId);
  notifyWorkoutsChanged();
}

/** Adds a set to an exercise, pre-filled with the values of its last set (what you usually want). */
export async function addSet(db: SQLiteDatabase, workoutExerciseId: string) {
  const last = await db.getFirstAsync<SetRow>(
    'SELECT * FROM sets WHERE workout_exercise_id = ? ORDER BY position DESC LIMIT 1',
    workoutExerciseId,
  );
  await db.runAsync(
    `INSERT INTO sets (id, workout_exercise_id, position, weight, reps, duration_sec, distance_m)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    newId(),
    workoutExerciseId,
    (last?.position ?? -1) + 1,
    last?.weight ?? null,
    last?.reps ?? null,
    last?.duration_sec ?? null,
    last?.distance_m ?? null,
  );
  notifyWorkoutsChanged();
}

/** Saves what's typed into a set's boxes. Doesn't notify, since the screen already shows it. */
export async function updateSetFields(db: SQLiteDatabase, setId: string, fields: SetFields) {
  await db.runAsync(
    'UPDATE sets SET weight = ?, reps = ?, duration_sec = ?, distance_m = ? WHERE id = ?',
    fields.weight,
    fields.reps,
    fields.duration_sec,
    fields.distance_m,
    setId,
  );
}

export async function setCompleted(db: SQLiteDatabase, setId: string, completed: boolean, fields: SetFields) {
  await db.runAsync(
    'UPDATE sets SET completed = ?, weight = ?, reps = ?, duration_sec = ?, distance_m = ? WHERE id = ?',
    completed ? 1 : 0,
    fields.weight,
    fields.reps,
    fields.duration_sec,
    fields.distance_m,
    setId,
  );
}

export async function deleteSet(db: SQLiteDatabase, setId: string) {
  await db.runAsync('DELETE FROM sets WHERE id = ?', setId);
  notifyWorkoutsChanged();
}

export type FinishSummary = { exercises: number; sets: number; volume: number; durationSec: number };

/**
 * Finishes the workout: drops sets that were never checked off, drops
 * exercises left with no sets, and stamps the finish time.
 */
export async function finishWorkout(db: SQLiteDatabase, workoutId: string): Promise<FinishSummary> {
  let summary: FinishSummary = { exercises: 0, sets: 0, volume: 0, durationSec: 0 };
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `DELETE FROM sets WHERE completed = 0 AND workout_exercise_id IN
         (SELECT id FROM workout_exercises WHERE workout_id = ?)`,
      workoutId,
    );
    await db.runAsync(
      `DELETE FROM workout_exercises WHERE workout_id = ?
         AND id NOT IN (SELECT DISTINCT workout_exercise_id FROM sets)`,
      workoutId,
    );
    const finishedAt = Date.now();
    await db.runAsync('UPDATE workouts SET finished_at = ? WHERE id = ?', finishedAt, workoutId);

    const stats = await db.getFirstAsync<{ exercises: number; sets: number; volume: number | null; started_at: number }>(
      `SELECT
         (SELECT COUNT(*) FROM workout_exercises WHERE workout_id = w.id) AS exercises,
         (SELECT COUNT(*) FROM sets s JOIN workout_exercises we ON we.id = s.workout_exercise_id
            WHERE we.workout_id = w.id) AS sets,
         (SELECT SUM(COALESCE(s.weight, 0) * COALESCE(s.reps, 0)) FROM sets s
            JOIN workout_exercises we ON we.id = s.workout_exercise_id WHERE we.workout_id = w.id) AS volume,
         w.started_at
       FROM workouts w WHERE w.id = ?`,
      workoutId,
    );
    if (stats) {
      summary = {
        exercises: stats.exercises,
        sets: stats.sets,
        volume: stats.volume ?? 0,
        durationSec: Math.round((finishedAt - stats.started_at) / 1000),
      };
    }
  });
  notifyWorkoutsChanged();
  return summary;
}

/** Deletes the workout and everything in it. */
export async function discardWorkout(db: SQLiteDatabase, workoutId: string) {
  await db.runAsync('DELETE FROM workouts WHERE id = ?', workoutId);
  notifyWorkoutsChanged();
}

// ---- formatting helpers -----------------------------------------------------

/** 75 → "1:15", 3725 → "1:02:05" */
export function formatDuration(totalSec: number) {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

export const METERS_PER_MILE = 1609.344;
