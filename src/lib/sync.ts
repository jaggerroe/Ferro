import type { SQLiteDatabase } from 'expo-sqlite';
import { useSyncExternalStore } from 'react';

import { notifyCustomExercisesChanged } from '@/lib/custom-exercises';
import { notifyMedsChanged } from '@/lib/meds';
import { loadSettings } from '@/lib/settings';
import { supabase } from '@/lib/supabase';
import { notifyWorkoutsChanged } from '@/lib/workouts';

/**
 * Cloud backup. The phone is the main copy; the backend mirrors it.
 *
 * - First sync of an account on this phone: download what's in the account
 *   (new phone / reinstall), merge it in, then upload everything ("full push").
 * - After that, only what changed is sent. Database triggers (migration v4)
 *   write every added, edited or deleted row into the sync_changes table;
 *   a backup uploads those rows, deletes the deleted ones from the server,
 *   and then clears the list. Nothing changed = no requests at all.
 * - If something looks off (the server is missing a row that a change
 *   depends on), it falls back to a full push, which fixes it.
 *
 * This is "one phone at a time": if you use two phones at once, the one that
 * synced last wins. Good enough until real multi-device sync is needed.
 */

/** Every backed-up table, in an order where parents come before children. */
const TABLES: { name: string; columns: string[] }[] = [
  { name: 'custom_exercises', columns: ['id', 'name', 'muscle', 'secondary', 'equipment', 'kind', 'created_at'] },
  { name: 'workouts', columns: ['id', 'name', 'started_at', 'finished_at', 'notes'] },
  { name: 'workout_exercises', columns: ['id', 'workout_id', 'exercise_id', 'position'] },
  {
    name: 'sets',
    columns: ['id', 'workout_exercise_id', 'position', 'weight', 'reps', 'duration_sec', 'distance_m', 'completed'],
  },
  { name: 'routines', columns: ['id', 'name', 'created_at', 'last_used_at'] },
  { name: 'routine_exercises', columns: ['id', 'routine_id', 'exercise_id', 'position', 'sets'] },
  // Meds & supplements. Private: the server has no friend access to these (see schema.sql).
  {
    name: 'compounds',
    columns: [
      'id', 'name', 'kind', 'form', 'unit', 'default_amount', 'schedule', 'schedule_days',
      'every_n', 'times', 'started_at', 'ended_at', 'notes', 'created_at',
    ],
  },
  { name: 'doses', columns: ['id', 'compound_id', 'amount', 'unit', 'taken_at', 'site', 'notes'] },
  { name: 'check_ins', columns: ['id', 'day', 'tag', 'severity', 'created_at'] },
  {
    name: 'lab_results',
    columns: ['id', 'drawn_at', 'marker', 'value', 'unit', 'ref_low', 'ref_high', 'notes', 'created_at'],
  },
];

/** Settings that get backed up (not the sync bookkeeping below). */
const SYNCED_SETTINGS = ['weightUnit', 'restSec', 'theme', 'showMedsTab'];
/** Bookkeeping, stored in the local settings table. */
const KEY_SYNC_USER = 'sync.userId';
const KEY_LAST_SYNC = 'sync.lastAt';
/** true = next backup must upload everything (set by migration v4, and after errors). */
const KEY_NEEDS_FULL = 'sync.needsFull';
/** The settings as last uploaded, so unchanged settings aren't re-sent every time. */
const KEY_SENT_SETTINGS = 'sync.sentSettings';

const PAGE = 1000;
const CHUNK = 500;

// ---- status, for the Profile screen -------------------------------------------

export type SyncStatus = {
  state: 'idle' | 'syncing' | 'error' | 'other-account';
  lastSyncedAt: number | null;
  error: string | null;
};

let status: SyncStatus = { state: 'idle', lastSyncedAt: null, error: null };
const listeners = new Set<() => void>();
function setStatus(next: Partial<SyncStatus>) {
  status = { ...status, ...next };
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
const getStatus = () => status;

export function useSyncStatus() {
  return useSyncExternalStore(subscribe, getStatus, getStatus);
}

// ---- bookkeeping ----------------------------------------------------------------

async function getMeta(db: SQLiteDatabase, key: string) {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', key);
  return row ? (JSON.parse(row.value) as unknown) : null;
}
async function setMeta(db: SQLiteDatabase, key: string, value: unknown) {
  await db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', key, JSON.stringify(value));
}

/** Reads the last backup time so the Profile screen can show it right away. */
export async function loadSyncStatus(db: SQLiteDatabase) {
  const last = await getMeta(db, KEY_LAST_SYNC);
  setStatus({ lastSyncedAt: typeof last === 'number' ? last : null });
}

/** Forget which account this phone syncs with (after signing out or deleting the account). */
export async function resetSyncAccount(db: SQLiteDatabase) {
  await db.runAsync('DELETE FROM settings WHERE key IN (?, ?, ?)', KEY_SYNC_USER, KEY_LAST_SYNC, KEY_SENT_SETTINGS);
  setStatus({ state: 'idle', lastSyncedAt: null, error: null });
}

// ---- the sync itself --------------------------------------------------------------

let running: Promise<void> | null = null;
let again = false;

/**
 * Backs up now. Safe to call often: if a sync is already running, it runs
 * once more afterwards instead of overlapping.
 *
 * `allowOtherAccount`: this phone last synced with a different account.
 * Normally sync stops and asks; pass true once you've chosen to merge.
 */
export function syncNow(db: SQLiteDatabase, userId: string, allowOtherAccount = false): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    try {
      do {
        again = false;
        await syncOnce(db, userId, allowOtherAccount);
      } while (again);
    } finally {
      running = null;
    }
  })();
  return running;
}

/** What the last backup sent, for testing and curiosity: rows uploaded / deleted. */
export let lastPushStats = { full: false, upserted: 0, deleted: 0 };

async function syncOnce(db: SQLiteDatabase, userId: string, allowOtherAccount: boolean) {
  if (!supabase) return;
  const previousUser = await getMeta(db, KEY_SYNC_USER);

  if (previousUser && previousUser !== userId && !allowOtherAccount) {
    setStatus({ state: 'other-account', error: null });
    return;
  }

  setStatus({ state: 'syncing', error: null });
  try {
    const firstTime = previousUser !== userId;
    // First time this account syncs on this phone: bring down what's in the cloud first,
    // so nothing in the backup gets removed before this phone has it.
    if (firstTime) await pull(db, userId);

    if (firstTime || (await getMeta(db, KEY_NEEDS_FULL)) === true) {
      await fullPush(db, userId);
    } else {
      try {
        await pushChanges(db, userId);
      } catch (err) {
        // 23503 = "foreign key violation": the server is missing a parent row
        // (say, a workout) that a changed row (one of its sets) points to. The
        // change list must have missed something, so upload everything once.
        if (codeOf(err) !== '23503') throw err;
        console.warn('Backup fell back to a full upload', err);
        await fullPush(db, userId);
      }
    }
    await pushSettings(db, userId, firstTime);

    const now = Date.now();
    await setMeta(db, KEY_SYNC_USER, userId);
    await setMeta(db, KEY_LAST_SYNC, now);
    setStatus({ state: 'idle', lastSyncedAt: now });
  } catch (err) {
    console.warn('Sync failed', err);
    setStatus({ state: 'error', error: messageFor(err) });
  }
}

/** Downloads everything in the account and adds whatever the phone doesn't have yet. */
async function pull(db: SQLiteDatabase, userId: string) {
  const client = supabase!;
  let added = 0;

  for (const table of TABLES) {
    const rows = await fetchAll(table.name, table.columns.join(','), userId);
    const placeholders = table.columns.map(() => '?').join(', ');
    const sql = `INSERT OR IGNORE INTO ${table.name} (${table.columns.join(', ')}) VALUES (${placeholders})`;
    for (const row of rows) {
      try {
        const result = await db.runAsync(sql, ...table.columns.map((c) => (row[c] ?? null) as string | number | null));
        added += result.changes;
      } catch {
        // A row whose parent is missing (e.g. a set from a deleted workout). Skip it.
      }
    }
  }

  const { data: settings, error } = await client.from('user_settings').select('key, value').eq('user_id', userId);
  if (error) throw error;
  for (const s of settings ?? []) {
    if (SYNCED_SETTINGS.includes(s.key)) {
      await db.runAsync('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', s.key, s.value);
    }
  }

  await loadSettings(db);
  if (added > 0) {
    notifyWorkoutsChanged();
    notifyCustomExercisesChanged();
    notifyMedsChanged();
  }
}

/**
 * The normal backup: send only rows in the change list.
 *
 * Order matters because of the server's foreign keys: uploads go parents
 * first (a workout before its sets), deletes go children first.
 *
 * We note the newest change number before starting and only clear up to
 * it, so anything you change while the backup is running stays on the list
 * for next time.
 */
async function pushChanges(db: SQLiteDatabase, userId: string) {
  const client = supabase!;
  const snap = await db.getFirstAsync<{ seq: number | null }>('SELECT MAX(seq) AS seq FROM sync_changes');
  const upTo = snap?.seq ?? null;
  lastPushStats = { full: false, upserted: 0, deleted: 0 };
  if (upTo === null) return; // nothing changed

  const changes = await db.getAllAsync<{ tbl: string; row_id: string; deleted: number }>(
    'SELECT tbl, row_id, deleted FROM sync_changes WHERE seq <= ?',
    upTo,
  );
  const byTable = (deleted: number) => {
    const map = new Map<string, string[]>();
    for (const c of changes) {
      if (c.deleted !== deleted) continue;
      map.set(c.tbl, [...(map.get(c.tbl) ?? []), c.row_id]);
    }
    return map;
  };
  const changed = byTable(0);
  const deleted = byTable(1);

  // 1. Uploads, parents first.
  for (const table of TABLES) {
    const ids = changed.get(table.name) ?? [];
    for (let i = 0; i < ids.length; i += CHUNK) {
      const part = ids.slice(i, i + CHUNK);
      const rows = await db.getAllAsync<Record<string, unknown>>(
        `SELECT ${table.columns.join(', ')} FROM ${table.name} WHERE id IN (${part.map(() => '?').join(', ')})`,
        ...part,
      );
      if (!rows.length) continue;
      const { error } = await client
        .from(table.name)
        .upsert(
          rows.map((r) => ({ ...r, user_id: userId })),
          { onConflict: 'user_id,id' },
        );
      if (error) throw error;
      lastPushStats.upserted += rows.length;
    }
  }

  // 2. Deletes, children first. (Deleting a workout on the server also
  // deletes its sets there, so deleting those again is harmless.)
  for (const table of [...TABLES].reverse()) {
    const ids = deleted.get(table.name) ?? [];
    for (let i = 0; i < ids.length; i += CHUNK / 2) {
      const part = ids.slice(i, i + CHUNK / 2);
      const { error } = await client.from(table.name).delete().eq('user_id', userId).in('id', part);
      if (error) throw error;
      lastPushStats.deleted += part.length;
    }
  }

  // 3. Done: clear what we sent (but not anything newer).
  await db.runAsync('DELETE FROM sync_changes WHERE seq <= ?', upTo);
}

/**
 * Uploads the phone's data and removes backed-up rows the phone no longer
 * has. Slow on big histories, so it only runs when needed (see syncOnce).
 */
async function fullPush(db: SQLiteDatabase, userId: string) {
  const client = supabase!;
  // Everything up to here gets uploaded below, so this part of the change list can go afterwards.
  const snap = await db.getFirstAsync<{ seq: number | null }>('SELECT MAX(seq) AS seq FROM sync_changes');
  lastPushStats = { full: true, upserted: 0, deleted: 0 };

  for (const table of TABLES) {
    const local = await db.getAllAsync<Record<string, unknown>>(
      `SELECT ${table.columns.join(', ')} FROM ${table.name}`,
    );
    for (let i = 0; i < local.length; i += CHUNK) {
      const chunk = local.slice(i, i + CHUNK).map((r) => ({ ...r, user_id: userId }));
      // Ids are unique per account (see schema.sql), so a row is matched by account + id.
      const { error } = await client.from(table.name).upsert(chunk, { onConflict: 'user_id,id' });
      if (error) throw error;
      lastPushStats.upserted += chunk.length;
    }

    const localIds = new Set(local.map((r) => r.id as string));
    const remote = await fetchAll(table.name, 'id', userId);
    const gone = remote.map((r) => r.id as string).filter((id) => !localIds.has(id));
    for (let i = 0; i < gone.length; i += CHUNK / 2) {
      const { error } = await client
        .from(table.name)
        .delete()
        .eq('user_id', userId)
        .in('id', gone.slice(i, i + CHUNK / 2));
      if (error) throw error;
      lastPushStats.deleted += Math.min(CHUNK / 2, gone.length - i);
    }
  }

  if (snap?.seq != null) await db.runAsync('DELETE FROM sync_changes WHERE seq <= ?', snap.seq);
  await setMeta(db, KEY_NEEDS_FULL, false);
}

/** Uploads your settings (units, rest time, ...), but only if they changed since last time. */
async function pushSettings(db: SQLiteDatabase, userId: string, force: boolean) {
  const settings = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM settings');
  const rows = settings.filter((s) => SYNCED_SETTINGS.includes(s.key));
  const fingerprint = JSON.stringify(rows.slice().sort((a, b) => a.key.localeCompare(b.key)));
  if (!rows.length || (!force && (await getMeta(db, KEY_SENT_SETTINGS)) === fingerprint)) return;
  const { error } = await supabase!
    .from('user_settings')
    .upsert(
      rows.map((s) => ({ ...s, user_id: userId })),
      { onConflict: 'user_id,key' },
    );
  if (error) throw error;
  await setMeta(db, KEY_SENT_SETTINGS, fingerprint);
}

/**
 * Every row of a table for this account, a page at a time.
 *
 * The `user_id` filter matters: friends can read each other's finished
 * workouts, so without it this would also return your friends' rows, and
 * sync would copy their workouts onto your phone as if they were yours.
 * Ordering by id keeps the pages from overlapping or skipping rows.
 */
async function fetchAll(table: string, columns: string, userId: string) {
  const all: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase!
      .from(table)
      .select(columns)
      .eq('user_id', userId)
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    all.push(...rows);
    if (rows.length < PAGE) return all;
  }
}

/** The Postgres error code from a Supabase error, e.g. '23503'. */
function codeOf(err: unknown) {
  return typeof err === 'object' && err && 'code' in err ? String((err as { code: unknown }).code) : null;
}

function messageFor(err: unknown) {
  const text = err instanceof Error ? err.message : typeof err === 'object' && err && 'message' in err ? String(err.message) : String(err);
  if (/network|fetch/i.test(text)) return 'Couldn’t reach the server. It’ll try again later.';
  if (/relation .* does not exist|schema cache/i.test(text)) return 'The backend tables are missing. Run supabase/schema.sql in Supabase.';
  return text;
}
