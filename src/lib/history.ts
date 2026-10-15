import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { useEffect, useState } from 'react';

import { getWorkoutBlocks, useWorkoutsVersion, type WorkoutExerciseBlock } from '@/lib/workouts';

/**
 * Reading finished workouts for the History tab and the workout details
 * screen. Everything here is read-only except `deleteWorkout`.
 */

export type HistoryItem = {
  id: string;
  name: string | null;
  started_at: number;
  finished_at: number;
  setCount: number;
  volume: number; // total lb × reps
  /** e.g. [{ exercise_id: 'bench-press', sets: 3 }, ...] in workout order */
  exercises: { exercise_id: string; sets: number }[];
};

/** All finished workouts, newest first, with their totals. */
export async function getHistory(db: SQLiteDatabase): Promise<HistoryItem[]> {
  const workouts = await db.getAllAsync<Omit<HistoryItem, 'exercises'>>(
    `SELECT w.id, w.name, w.started_at, w.finished_at,
       (SELECT COUNT(*) FROM sets s JOIN workout_exercises we ON we.id = s.workout_exercise_id
          WHERE we.workout_id = w.id) AS setCount,
       COALESCE((SELECT SUM(COALESCE(s.weight, 0) * COALESCE(s.reps, 0)) FROM sets s
          JOIN workout_exercises we ON we.id = s.workout_exercise_id WHERE we.workout_id = w.id), 0) AS volume
     FROM workouts w
     WHERE w.finished_at IS NOT NULL
     ORDER BY w.started_at DESC`,
  );

  // One query for every workout's exercise list, then group them in JS.
  const rows = await db.getAllAsync<{ workout_id: string; exercise_id: string; sets: number }>(
    `SELECT we.workout_id, we.exercise_id, COUNT(s.id) AS sets
     FROM workout_exercises we
     JOIN workouts w ON w.id = we.workout_id
     LEFT JOIN sets s ON s.workout_exercise_id = we.id
     WHERE w.finished_at IS NOT NULL
     GROUP BY we.id
     ORDER BY we.workout_id, we.position`,
  );
  const byWorkout = new Map<string, { exercise_id: string; sets: number }[]>();
  for (const r of rows) {
    const list = byWorkout.get(r.workout_id) ?? [];
    list.push({ exercise_id: r.exercise_id, sets: r.sets });
    byWorkout.set(r.workout_id, list);
  }

  return workouts.map((w) => ({ ...w, exercises: byWorkout.get(w.id) ?? [] }));
}

/** History list that re-loads whenever a workout is finished, edited or deleted. */
export function useHistory() {
  const db = useSQLiteContext();
  const changes = useWorkoutsVersion();
  const [items, setItems] = useState<HistoryItem[] | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    getHistory(db)
      .then((h) => alive && setItems(h))
      .catch((err) => console.warn('Could not load history', err));
    return () => {
      alive = false;
    };
  }, [db, changes]);

  return items;
}

export type WorkoutDetail = {
  id: string;
  name: string | null;
  started_at: number;
  finished_at: number | null;
  blocks: WorkoutExerciseBlock[];
};

/** One workout with every exercise and set, for the details screen. */
export function useWorkoutDetail(workoutId: string | undefined) {
  const db = useSQLiteContext();
  const changes = useWorkoutsVersion();
  // undefined = loading, null = not found (e.g. just deleted)
  const [detail, setDetail] = useState<WorkoutDetail | null | undefined>(undefined);

  useEffect(() => {
    if (!workoutId) return;
    let alive = true;
    (async () => {
      const w = await db.getFirstAsync<Omit<WorkoutDetail, 'blocks'>>(
        'SELECT id, name, started_at, finished_at FROM workouts WHERE id = ?',
        workoutId,
      );
      const blocks = w ? await getWorkoutBlocks(db, w.id) : [];
      if (alive) setDetail(w ? { ...w, blocks } : null);
    })().catch((err) => console.warn('Could not load workout', err));
    return () => {
      alive = false;
    };
  }, [db, workoutId, changes]);

  return detail;
}

// ---- formatting --------------------------------------------------------------

/** "October 2026" — used for the month headings in the list. */
export function monthLabel(ms: number) {
  return new Date(ms).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

/** "Today", "Yesterday", or "Wed, Oct 14" (adds the year if it's not this year). */
export function dayLabel(ms: number, now = new Date()) {
  const d = new Date(ms);
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  });
}

/** "8:05 AM" */
export function timeLabel(ms: number) {
  return new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** 3725 seconds → "1h 2m", 540 → "9m" */
export function shortDuration(totalSec: number) {
  const m = Math.max(1, Math.round(totalSec / 60));
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
}

/** 12450 → "12,450 lb", 0 → null (so cardio-only workouts don't show "0 lb") */
export function volumeLabel(volume: number) {
  return volume > 0 ? `${Math.round(volume).toLocaleString()} lb` : null;
}
