import type { SQLiteDatabase } from 'expo-sqlite';
import { useSyncExternalStore } from 'react';

import { notifyCustomExercisesChanged } from '@/lib/custom-exercises';
import { loadSettings } from '@/lib/settings';
import { supabase } from '@/lib/supabase';
import { notifyWorkoutsChanged } from '@/lib/workouts';

/**
 * Cloud backup. The phone is the main copy; the backend mirrors it.
 *
 * - First sync of an account on this phone: download what's in the account
 *   (new phone / reinstall), merge it in, then upload everything.
 * - After that: upload the phone's data and remove anything from the backup
 *   that you deleted on the phone.
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
];

/** Settings that get backed up (not the sync bookkeeping below). */
const SYNCED_SETTINGS = ['weightUnit', 'restSec', 'theme'];
/** Bookkeeping, stored in the local settings table. */
const KEY_SYNC_USER = 'sync.userId';
const KEY_LAST_SYNC = 'sync.lastAt';

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
  await db.runAsync('DELETE FROM settings WHERE key IN (?, ?)', KEY_SYNC_USER, KEY_LAST_SYNC);
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

async function syncOnce(db: SQLiteDatabase, userId: string, allowOtherAccount: boolean) {
  if (!supabase) return;
  const previousUser = await getMeta(db, KEY_SYNC_USER);

  if (previousUser && previousUser !== userId && !allowOtherAccount) {
    setStatus({ state: 'other-account', error: null });
    return;
  }

  setStatus({ state: 'syncing', error: null });
  try {
    // First time this account syncs on this phone: bring down what's in the cloud first,
    // so nothing in the backup gets removed before this phone has it.
    if (previousUser !== userId) await pull(db);
    await push(db, userId);

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
async function pull(db: SQLiteDatabase) {
  const client = supabase!;
  let added = 0;

  for (const table of TABLES) {
    const rows = await fetchAll(table.name, table.columns.join(','));
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

  const { data: settings, error } = await client.from('user_settings').select('key, value');
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
  }
}

/** Uploads the phone's data and removes backed-up rows the phone no longer has. */
async function push(db: SQLiteDatabase, userId: string) {
  const client = supabase!;

  for (const table of TABLES) {
    const local = await db.getAllAsync<Record<string, unknown>>(
      `SELECT ${table.columns.join(', ')} FROM ${table.name}`,
    );
    for (let i = 0; i < local.length; i += CHUNK) {
      const chunk = local.slice(i, i + CHUNK).map((r) => ({ ...r, user_id: userId }));
      const { error } = await client.from(table.name).upsert(chunk, { onConflict: 'id' });
      if (error) throw error;
    }

    const localIds = new Set(local.map((r) => r.id as string));
    const remote = await fetchAll(table.name, 'id');
    const gone = remote.map((r) => r.id as string).filter((id) => !localIds.has(id));
    for (let i = 0; i < gone.length; i += CHUNK / 2) {
      const { error } = await client.from(table.name).delete().in('id', gone.slice(i, i + CHUNK / 2));
      if (error) throw error;
    }
  }

  const settings = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM settings');
  const rows = settings.filter((s) => SYNCED_SETTINGS.includes(s.key)).map((s) => ({ ...s, user_id: userId }));
  if (rows.length) {
    const { error } = await client.from('user_settings').upsert(rows, { onConflict: 'user_id,key' });
    if (error) throw error;
  }
}

/** Every row of a table for this account, a page at a time. */
async function fetchAll(table: string, columns: string) {
  const all: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase!.from(table).select(columns).range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    all.push(...rows);
    if (rows.length < PAGE) return all;
  }
}

function messageFor(err: unknown) {
  const text = err instanceof Error ? err.message : typeof err === 'object' && err && 'message' in err ? String(err.message) : String(err);
  if (/network|fetch/i.test(text)) return 'Couldn’t reach the server. It’ll try again later.';
  if (/relation .* does not exist|schema cache/i.test(text)) return 'The backend tables are missing. Run supabase/schema.sql in Supabase.';
  return text;
}
