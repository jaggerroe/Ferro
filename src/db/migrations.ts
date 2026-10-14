import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Ferro's on-device database setup.
 *
 * SQLite keeps a number called `user_version` inside the database file.
 * Each entry in MIGRATIONS moves the database up one version. On app launch
 * we run only the migrations this phone hasn't run yet, so existing workouts
 * are kept when the app updates.
 *
 * RULES for changing the database later:
 *  - NEVER edit a migration that has already shipped to anyone's phone.
 *  - To change something, ADD a new migration to the end of the list
 *    (e.g. `ALTER TABLE sets ADD COLUMN rpe REAL;`).
 */
const MIGRATIONS: string[] = [
  // Version 1: custom exercises, workouts, the exercises in each workout, and their sets.
  `
  CREATE TABLE custom_exercises (
    id          TEXT PRIMARY KEY NOT NULL,
    name        TEXT NOT NULL UNIQUE COLLATE NOCASE,
    muscle      TEXT NOT NULL,
    secondary   TEXT NOT NULL DEFAULT '[]',   -- JSON array, e.g. ["Triceps","Shoulders"]
    equipment   TEXT NOT NULL,
    kind        TEXT NOT NULL,                -- 'strength' | 'bodyweight' | 'cardio'
    created_at  INTEGER NOT NULL              -- milliseconds since 1970
  );

  CREATE TABLE workouts (
    id           TEXT PRIMARY KEY NOT NULL,
    name         TEXT,
    started_at   INTEGER NOT NULL,
    finished_at  INTEGER,                     -- NULL while the workout is in progress
    notes        TEXT
  );

  -- One row per exercise added to a workout. exercise_id is either a built-in id
  -- like 'bench-press' or a custom_exercises id.
  CREATE TABLE workout_exercises (
    id           TEXT PRIMARY KEY NOT NULL,
    workout_id   TEXT NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
    exercise_id  TEXT NOT NULL,
    position     INTEGER NOT NULL
  );

  -- Columns that don't apply to an exercise's kind stay NULL
  -- (e.g. a run has duration + distance but no weight or reps).
  CREATE TABLE sets (
    id                   TEXT PRIMARY KEY NOT NULL,
    workout_exercise_id  TEXT NOT NULL REFERENCES workout_exercises(id) ON DELETE CASCADE,
    position             INTEGER NOT NULL,
    weight               REAL,               -- stored in the user's unit for now
    reps                 INTEGER,
    duration_sec         INTEGER,
    distance_m           REAL,
    completed            INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX idx_workout_exercises_workout  ON workout_exercises(workout_id);
  CREATE INDEX idx_workout_exercises_exercise ON workout_exercises(exercise_id);
  CREATE INDEX idx_sets_workout_exercise      ON sets(workout_exercise_id);
  CREATE INDEX idx_workouts_started           ON workouts(started_at);
  `,
];

export const DATABASE_NAME = 'ferro.db';

/** Runs once when the app opens, before any screen touches the database. */
export async function migrateDbIfNeeded(db: SQLiteDatabase) {
  // WAL = faster writes; foreign_keys makes ON DELETE CASCADE actually work.
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;

  while (version < MIGRATIONS.length) {
    const sql = MIGRATIONS[version];
    const next = version + 1;
    // All-or-nothing: if a migration fails halfway, none of it is applied.
    await db.withTransactionAsync(async () => {
      await db.execAsync(sql);
      await db.execAsync(`PRAGMA user_version = ${next}`);
    });
    version = next;
  }
}

/** Short random id like "mgq3k2a1-7f3k9x2p". Unique enough to sync to a server later. */
export function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
