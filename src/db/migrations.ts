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

  // Version 2: routines (saved workout templates, like "Push day").
  `
  CREATE TABLE routines (
    id            TEXT PRIMARY KEY NOT NULL,
    name          TEXT NOT NULL,
    created_at    INTEGER NOT NULL,
    last_used_at  INTEGER                 -- NULL until you start it the first time
  );

  -- The exercises in a routine, in order, with how many sets to start with.
  CREATE TABLE routine_exercises (
    id           TEXT PRIMARY KEY NOT NULL,
    routine_id   TEXT NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
    exercise_id  TEXT NOT NULL,
    position     INTEGER NOT NULL,
    sets         INTEGER NOT NULL DEFAULT 3
  );

  CREATE INDEX idx_routine_exercises_routine ON routine_exercises(routine_id);
  `,

  // Version 3: your settings (units, default rest time, theme), one row per setting.
  `
  CREATE TABLE settings (
    key    TEXT PRIMARY KEY NOT NULL,
    value  TEXT NOT NULL                 -- stored as JSON, e.g. "kg" or 120
  );
  `,

  // Version 4: a list of what changed since the last backup, so backups only
  // send changes instead of your whole history (see src/lib/sync.ts).
  // Triggers add a row to sync_changes whenever a backed-up row is added,
  // edited or deleted (including sets deleted along with their workout).
  // Saving the same row again replaces its entry, so 50 edits to one set
  // are still one entry.
  `
  CREATE TABLE sync_changes (
    seq      INTEGER PRIMARY KEY AUTOINCREMENT,  -- increases with every change
    tbl      TEXT NOT NULL,
    row_id   TEXT NOT NULL,
    deleted  INTEGER NOT NULL DEFAULT 0,          -- 1 = row was deleted
    UNIQUE (tbl, row_id) ON CONFLICT REPLACE
  );

  CREATE TRIGGER sync_custom_exercises_insert AFTER INSERT ON custom_exercises
    BEGIN INSERT INTO sync_changes (tbl, row_id, deleted) VALUES ('custom_exercises', NEW.id, 0); END;
  CREATE TRIGGER sync_custom_exercises_update AFTER UPDATE ON custom_exercises
    BEGIN INSERT INTO sync_changes (tbl, row_id, deleted) VALUES ('custom_exercises', NEW.id, 0); END;
  CREATE TRIGGER sync_custom_exercises_delete AFTER DELETE ON custom_exercises
    BEGIN INSERT INTO sync_changes (tbl, row_id, deleted) VALUES ('custom_exercises', OLD.id, 1); END;
  CREATE TRIGGER sync_workouts_insert AFTER INSERT ON workouts
    BEGIN INSERT INTO sync_changes (tbl, row_id, deleted) VALUES ('workouts', NEW.id, 0); END;
  CREATE TRIGGER sync_workouts_update AFTER UPDATE ON workouts
    BEGIN INSERT INTO sync_changes (tbl, row_id, deleted) VALUES ('workouts', NEW.id, 0); END;
  CREATE TRIGGER sync_workouts_delete AFTER DELETE ON workouts
    BEGIN INSERT INTO sync_changes (tbl, row_id, deleted) VALUES ('workouts', OLD.id, 1); END;
  CREATE TRIGGER sync_workout_exercises_insert AFTER INSERT ON workout_exercises
    BEGIN INSERT INTO sync_changes (tbl, row_id, deleted) VALUES ('workout_exercises', NEW.id, 0); END;
  CREATE TRIGGER sync_workout_exercises_update AFTER UPDATE ON workout_exercises
    BEGIN INSERT INTO sync_changes (tbl, row_id, deleted) VALUES ('workout_exercises', NEW.id, 0); END;
  CREATE TRIGGER sync_workout_exercises_delete AFTER DELETE ON workout_exercises
    BEGIN INSERT INTO sync_changes (tbl, row_id, deleted) VALUES ('workout_exercises', OLD.id, 1); END;
  CREATE TRIGGER sync_sets_insert AFTER INSERT ON sets
    BEGIN INSERT INTO sync_changes (tbl, row_id, deleted) VALUES ('sets', NEW.id, 0); END;
  CREATE TRIGGER sync_sets_update AFTER UPDATE ON sets
    BEGIN INSERT INTO sync_changes (tbl, row_id, deleted) VALUES ('sets', NEW.id, 0); END;
  CREATE TRIGGER sync_sets_delete AFTER DELETE ON sets
    BEGIN INSERT INTO sync_changes (tbl, row_id, deleted) VALUES ('sets', OLD.id, 1); END;
  CREATE TRIGGER sync_routines_insert AFTER INSERT ON routines
    BEGIN INSERT INTO sync_changes (tbl, row_id, deleted) VALUES ('routines', NEW.id, 0); END;
  CREATE TRIGGER sync_routines_update AFTER UPDATE ON routines
    BEGIN INSERT INTO sync_changes (tbl, row_id, deleted) VALUES ('routines', NEW.id, 0); END;
  CREATE TRIGGER sync_routines_delete AFTER DELETE ON routines
    BEGIN INSERT INTO sync_changes (tbl, row_id, deleted) VALUES ('routines', OLD.id, 1); END;
  CREATE TRIGGER sync_routine_exercises_insert AFTER INSERT ON routine_exercises
    BEGIN INSERT INTO sync_changes (tbl, row_id, deleted) VALUES ('routine_exercises', NEW.id, 0); END;
  CREATE TRIGGER sync_routine_exercises_update AFTER UPDATE ON routine_exercises
    BEGIN INSERT INTO sync_changes (tbl, row_id, deleted) VALUES ('routine_exercises', NEW.id, 0); END;
  CREATE TRIGGER sync_routine_exercises_delete AFTER DELETE ON routine_exercises
    BEGIN INSERT INTO sync_changes (tbl, row_id, deleted) VALUES ('routine_exercises', OLD.id, 1); END;

  -- Changes made before this update weren't tracked, so the next backup
  -- uploads everything once to be safe.
  INSERT OR REPLACE INTO settings (key, value) VALUES ('sync.needsFull', 'true');
  `,

  // Version 5: meds & supplements (the optional Meds tab, see src/lib/meds.ts).
  // A "compound" is anything you take: a prescription, a supplement, a
  // peptide. You set it up once (with its schedule), then log each dose.
  // Backed up like workouts, but private: friends can never see these.
  `
  CREATE TABLE compounds (
    id              TEXT PRIMARY KEY NOT NULL,
    name            TEXT NOT NULL,
    kind            TEXT NOT NULL,              -- 'rx' | 'supplement' | 'peptide' | 'other'
    form            TEXT NOT NULL,              -- 'pill' | 'injection' | 'powder' | 'liquid' | 'topical' | 'other'
    unit            TEXT NOT NULL,              -- what amounts are in: 'mg', 'mcg', 'IU', ...
    default_amount  REAL,                       -- your usual dose, pre-filled when logging
    schedule        TEXT NOT NULL DEFAULT 'daily', -- 'daily' | 'days' | 'every_n' | 'as_needed'
    schedule_days   TEXT NOT NULL DEFAULT '[]', -- JSON weekdays for 'days', 0 = Sunday, e.g. [1,3,5]
    every_n         INTEGER,                    -- for 'every_n': every 2, 3, ... days
    times           TEXT NOT NULL DEFAULT '["08:00"]', -- JSON list of "HH:MM", one per dose that day
    started_at      INTEGER NOT NULL,           -- "every N days" counts from this day
    ended_at        INTEGER,                    -- set when you mark it finished; NULL = active
    notes           TEXT,
    created_at      INTEGER NOT NULL
  );

  CREATE TABLE doses (
    id           TEXT PRIMARY KEY NOT NULL,
    compound_id  TEXT NOT NULL REFERENCES compounds(id) ON DELETE CASCADE,
    amount       REAL,                          -- NULL if you just ticked it off
    unit         TEXT NOT NULL,                 -- copied from the compound, so old doses keep their unit
    taken_at     INTEGER NOT NULL,
    site         TEXT,                          -- injection site, e.g. 'Left abdomen'
    notes        TEXT
  );

  CREATE INDEX idx_doses_compound_taken ON doses(compound_id, taken_at);
  CREATE INDEX idx_doses_taken          ON doses(taken_at);

  -- Same change tracking as version 4. These tables are brand new (empty),
  -- so unlike v4 there's nothing old to upload and no full backup is needed.
  CREATE TRIGGER sync_compounds_insert AFTER INSERT ON compounds
    BEGIN INSERT INTO sync_changes (tbl, row_id, deleted) VALUES ('compounds', NEW.id, 0); END;
  CREATE TRIGGER sync_compounds_update AFTER UPDATE ON compounds
    BEGIN INSERT INTO sync_changes (tbl, row_id, deleted) VALUES ('compounds', NEW.id, 0); END;
  CREATE TRIGGER sync_compounds_delete AFTER DELETE ON compounds
    BEGIN INSERT INTO sync_changes (tbl, row_id, deleted) VALUES ('compounds', OLD.id, 1); END;
  CREATE TRIGGER sync_doses_insert AFTER INSERT ON doses
    BEGIN INSERT INTO sync_changes (tbl, row_id, deleted) VALUES ('doses', NEW.id, 0); END;
  CREATE TRIGGER sync_doses_update AFTER UPDATE ON doses
    BEGIN INSERT INTO sync_changes (tbl, row_id, deleted) VALUES ('doses', NEW.id, 0); END;
  CREATE TRIGGER sync_doses_delete AFTER DELETE ON doses
    BEGIN INSERT INTO sync_changes (tbl, row_id, deleted) VALUES ('doses', OLD.id, 1); END;
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
