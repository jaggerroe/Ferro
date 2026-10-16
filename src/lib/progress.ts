import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { useEffect, useState } from 'react';

import type { ExerciseKind } from '@/data/exercises';
import { formatWeight, formatWeightRounded } from '@/lib/settings';
import { formatDuration, METERS_PER_MILE, useWorkoutsVersion } from '@/lib/workouts';

/**
 * Progress and personal records (PRs), worked out from every completed set
 * in your finished workouts.
 *
 * "Est. 1RM" is an estimated one-rep max using the Epley formula:
 * weight × (1 + reps / 30). It lets a 185 × 8 and a 205 × 3 be compared.
 */

/** One completed set, with the workout it belongs to. */
export type SetPoint = {
  workoutId: string;
  startedAt: number;
  exerciseId: string;
  weight: number | null;
  reps: number | null;
  durationSec: number | null;
  distanceM: number | null;
};

/** One exercise's numbers within one workout. */
export type Session = {
  workoutId: string;
  startedAt: number;
  sets: number;
  maxWeight: number;
  /** The set behind maxWeight (most reps breaks a tie). */
  maxWeightSet: { weight: number; reps: number } | null;
  bestE1rm: number;
  bestE1rmSet: { weight: number; reps: number } | null;
  maxReps: number;
  totalReps: number;
  volume: number;
  maxDistanceM: number;
  totalDistanceM: number;
  totalDurationSec: number;
};

export function estimateOneRepMax(weight: number, reps: number) {
  if (weight <= 0 || reps <= 0) return 0;
  return reps === 1 ? weight : weight * (1 + reps / 30);
}

// ---- loading ------------------------------------------------------------------

export async function getAllSetPoints(db: SQLiteDatabase) {
  return db.getAllAsync<SetPoint>(
    `SELECT w.id AS workoutId, w.started_at AS startedAt, we.exercise_id AS exerciseId,
            s.weight, s.reps, s.duration_sec AS durationSec, s.distance_m AS distanceM
     FROM sets s
     JOIN workout_exercises we ON we.id = s.workout_exercise_id
     JOIN workouts w ON w.id = we.workout_id
     WHERE s.completed = 1 AND w.finished_at IS NOT NULL
     ORDER BY w.started_at, we.position, s.position`,
  );
}

/** Every completed set, grouped by exercise. Re-loads after any workout change. */
export function useSetPointsByExercise() {
  const db = useSQLiteContext();
  const changes = useWorkoutsVersion();
  const [byExercise, setByExercise] = useState<Map<string, SetPoint[]> | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    getAllSetPoints(db)
      .then((points) => {
        if (!alive) return;
        const map = new Map<string, SetPoint[]>();
        for (const p of points) {
          const list = map.get(p.exerciseId) ?? [];
          list.push(p);
          map.set(p.exerciseId, list);
        }
        setByExercise(map);
      })
      .catch((err) => console.warn('Could not load progress', err));
    return () => {
      alive = false;
    };
  }, [db, changes]);

  return byExercise;
}

// ---- crunching numbers --------------------------------------------------------

/** Groups one exercise's sets into sessions (one per workout), oldest first. */
export function toSessions(points: SetPoint[]): Session[] {
  const sessions: Session[] = [];
  const byWorkout = new Map<string, Session>();
  for (const p of points) {
    let s = byWorkout.get(p.workoutId);
    if (!s) {
      s = {
        workoutId: p.workoutId,
        startedAt: p.startedAt,
        sets: 0,
        maxWeight: 0,
        maxWeightSet: null,
        bestE1rm: 0,
        bestE1rmSet: null,
        maxReps: 0,
        totalReps: 0,
        volume: 0,
        maxDistanceM: 0,
        totalDistanceM: 0,
        totalDurationSec: 0,
      };
      byWorkout.set(p.workoutId, s);
      sessions.push(s);
    }
    const w = p.weight ?? 0;
    const r = p.reps ?? 0;
    s.sets++;
    if (w > s.maxWeight || (w === s.maxWeight && w > 0 && r > (s.maxWeightSet?.reps ?? 0))) {
      s.maxWeight = w;
      s.maxWeightSet = { weight: w, reps: r };
    }
    const e = estimateOneRepMax(w, r);
    if (e > s.bestE1rm) {
      s.bestE1rm = e;
      s.bestE1rmSet = { weight: w, reps: r };
    }
    s.maxReps = Math.max(s.maxReps, r);
    s.totalReps += r;
    s.volume += w * r;
    s.maxDistanceM = Math.max(s.maxDistanceM, p.distanceM ?? 0);
    s.totalDistanceM += p.distanceM ?? 0;
    s.totalDurationSec += p.durationSec ?? 0;
  }
  return sessions.sort((a, b) => a.startedAt - b.startedAt);
}

/** A number you can chart for an exercise, like "Est. 1RM". */
export type Metric = {
  key: string;
  label: string;
  value: (s: Session) => number;
  format: (n: number) => string;
};

// Weights are stored in lb; these show them in your chosen unit.
const lb = (n: number) => formatWeight(n);
const miles = (m: number) => `${trimNumber(m / METERS_PER_MILE)} mi`;

const METRICS: Record<string, Metric> = {
  e1rm: { key: 'e1rm', label: 'Est. 1RM', value: (s) => s.bestE1rm, format: formatWeightRounded },
  heaviest: { key: 'heaviest', label: 'Heaviest', value: (s) => s.maxWeight, format: lb },
  volume: { key: 'volume', label: 'Volume', value: (s) => s.volume, format: formatWeightRounded },
  maxReps: { key: 'maxReps', label: 'Best set', value: (s) => s.maxReps, format: (n) => `${n} reps` },
  totalReps: { key: 'totalReps', label: 'Total reps', value: (s) => s.totalReps, format: (n) => `${n} reps` },
  distance: { key: 'distance', label: 'Distance', value: (s) => s.totalDistanceM, format: miles },
  time: { key: 'time', label: 'Time', value: (s) => s.totalDurationSec, format: (n) => formatDuration(n) },
};

/** The metrics worth charting for this kind of exercise; the first is the headline. */
export function metricsFor(kind: ExerciseKind, sessions: Session[]): Metric[] {
  if (kind === 'strength') return [METRICS.e1rm, METRICS.heaviest, METRICS.volume];
  if (kind === 'bodyweight') return [METRICS.maxReps, METRICS.totalReps];
  // Cardio: lead with distance if you've ever logged one, otherwise time.
  const hasDistance = sessions.some((s) => s.totalDistanceM > 0);
  return hasDistance ? [METRICS.distance, METRICS.time] : [METRICS.time, METRICS.distance];
}

/** An all-time record, like "Heaviest weight: 225 lb × 3 on Oct 14". */
export type RecordItem = { label: string; value: string; detail: string | null; startedAt: number };

export function recordsFor(kind: ExerciseKind, sessions: Session[]): RecordItem[] {
  if (sessions.length === 0) return [];
  const best = (score: (s: Session) => number) =>
    sessions.reduce((a, b) => (score(b) > score(a) ? b : a));
  const records: RecordItem[] = [];

  if (kind === 'strength') {
    // Same top weight in two sessions? The one with more reps wins.
    const heavy = best((s) => s.maxWeight * 1000 + (s.maxWeightSet?.reps ?? 0));
    if (heavy.maxWeightSet)
      records.push({ label: 'Heaviest weight', value: lb(heavy.maxWeight), detail: `× ${heavy.maxWeightSet.reps}`, startedAt: heavy.startedAt });
    const e = best((s) => s.bestE1rm);
    if (e.bestE1rmSet)
      records.push({ label: 'Best est. 1RM', value: METRICS.e1rm.format(e.bestE1rm), detail: `from ${formatWeight(e.bestE1rmSet.weight)} × ${e.bestE1rmSet.reps}`, startedAt: e.startedAt });
    const v = best((s) => s.volume);
    records.push({ label: 'Most volume', value: METRICS.volume.format(v.volume), detail: `${v.sets} ${v.sets === 1 ? 'set' : 'sets'}`, startedAt: v.startedAt });
    const reps = best((s) => s.maxReps);
    records.push({ label: 'Most reps in a set', value: `${reps.maxReps} reps`, detail: null, startedAt: reps.startedAt });
  } else if (kind === 'bodyweight') {
    const reps = best((s) => s.maxReps);
    records.push({ label: 'Most reps in a set', value: `${reps.maxReps} reps`, detail: null, startedAt: reps.startedAt });
    const total = best((s) => s.totalReps);
    records.push({ label: 'Most reps in a workout', value: `${total.totalReps} reps`, detail: `${total.sets} ${total.sets === 1 ? 'set' : 'sets'}`, startedAt: total.startedAt });
  } else {
    const far = best((s) => s.totalDistanceM);
    if (far.totalDistanceM > 0)
      records.push({ label: 'Longest distance', value: miles(far.totalDistanceM), detail: null, startedAt: far.startedAt });
    const long = best((s) => s.totalDurationSec);
    if (long.totalDurationSec > 0)
      records.push({ label: 'Longest time', value: formatDuration(long.totalDurationSec), detail: null, startedAt: long.startedAt });
  }
  return records;
}

// ---- PRs for a just-finished workout -----------------------------------------

export type NewPR = { exerciseId: string; label: string; value: string };

/**
 * Compares a workout against every earlier one and returns the records it
 * broke. Your first time doing an exercise doesn't count as a PR (there's
 * nothing to beat yet).
 */
export async function findNewPRs(
  db: SQLiteDatabase,
  workoutId: string,
  kindOf: (exerciseId: string) => ExerciseKind,
): Promise<NewPR[]> {
  const points = await getAllSetPoints(db);
  const current = points.filter((p) => p.workoutId === workoutId);
  if (current.length === 0) return [];
  const startedAt = current[0].startedAt;
  const prs: NewPR[] = [];

  for (const exerciseId of new Set(current.map((p) => p.exerciseId))) {
    const before = toSessions(points.filter((p) => p.exerciseId === exerciseId && p.startedAt < startedAt));
    if (before.length === 0) continue;
    const [now] = toSessions(current.filter((p) => p.exerciseId === exerciseId));
    const prevBest = (f: (s: Session) => number) => Math.max(...before.map(f));
    const kind = kindOf(exerciseId);

    if (kind === 'strength') {
      if (now.maxWeight > prevBest((s) => s.maxWeight) && now.maxWeightSet) {
        prs.push({ exerciseId, label: 'Heaviest weight', value: `${lb(now.maxWeight)} × ${now.maxWeightSet.reps}` });
      } else if (now.bestE1rm > prevBest((s) => s.bestE1rm) + 0.5 && now.bestE1rmSet) {
        // Only mention est. 1RM when it isn't already covered by a heavier weight.
        prs.push({ exerciseId, label: 'Est. 1RM', value: `${METRICS.e1rm.format(now.bestE1rm)} (${formatWeight(now.bestE1rmSet.weight)} × ${now.bestE1rmSet.reps})` });
      }
    } else if (kind === 'bodyweight') {
      if (now.maxReps > prevBest((s) => s.maxReps)) prs.push({ exerciseId, label: 'Most reps', value: `${now.maxReps} reps` });
    } else {
      if (now.totalDistanceM > 0 && now.totalDistanceM > prevBest((s) => s.totalDistanceM))
        prs.push({ exerciseId, label: 'Longest distance', value: miles(now.totalDistanceM) });
      else if (now.totalDurationSec > 0 && now.totalDurationSec > prevBest((s) => s.totalDurationSec))
        prs.push({ exerciseId, label: 'Longest time', value: formatDuration(now.totalDurationSec) });
    }
  }
  return prs;
}

/** 2.50 → "2.5", 135.00 → "135" */
export function trimNumber(n: number, decimals = 2) {
  return String(Number(n.toFixed(decimals)));
}

/** "+20 lb" / "−5 reps" style change between first and latest session; null if no change or only one. */
export function changeLabel(metric: Metric, sessions: Session[]) {
  if (sessions.length < 2) return null;
  const diff = metric.value(sessions[sessions.length - 1]) - metric.value(sessions[0]);
  if (Math.abs(diff) < 0.5) return null;
  return `${diff > 0 ? '+' : '−'}${metric.format(Math.abs(diff))}`;
}
