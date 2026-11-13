import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { useEffect, useState, useSyncExternalStore } from 'react';

import { newId } from '@/db/migrations';

/**
 * Meds & supplements: the optional Meds tab.
 *
 * Two tables (see migration v5):
 *  - compounds: each thing you take, set up once, with its schedule.
 *  - doses: one row every time you take something.
 *
 * Ferro only records what you type in. There's no built-in list of drugs
 * and no dosing advice, on purpose: it's a log, not a guide (and Apple
 * rejects apps that suggest how to use drugs).
 *
 * Private: this data backs up to your account but has no friend access.
 */

// ---- "something changed" signal ------------------------------------------
// Same idea as notifyWorkoutsChanged: screens re-load when this ticks.

let version = 0;
const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
const getVersion = () => version;
export function notifyMedsChanged() {
  version++;
  listeners.forEach((l) => l());
}
export function useMedsVersion() {
  return useSyncExternalStore(subscribe, getVersion, getVersion);
}

// ---- choices ------------------------------------------------------------------

export const KINDS = { rx: 'Prescription', supplement: 'Supplement', peptide: 'Peptide', other: 'Other' } as const;
export type CompoundKind = keyof typeof KINDS;

export const FORMS = {
  pill: 'Pill',
  injection: 'Injection',
  powder: 'Powder',
  liquid: 'Liquid',
  topical: 'Topical',
  other: 'Other',
} as const;
export type CompoundForm = keyof typeof FORMS;

export const UNITS = ['mg', 'mcg', 'g', 'IU', 'mL', 'units', 'pills', 'scoops'] as const;

export type Schedule = 'daily' | 'days' | 'every_n' | 'as_needed';
export const SCHEDULES: { value: Schedule; label: string }[] = [
  { value: 'daily', label: 'Every day' },
  { value: 'days', label: 'Certain days' },
  { value: 'every_n', label: 'Every few days' },
  { value: 'as_needed', label: 'As needed' },
];

/** Short weekday names, index = JS weekday (0 = Sunday). */
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const EVERY_N_OPTIONS = [2, 3, 4, 5, 7, 14];

/** Times of day you can pick. One dose per time you pick. */
export const TIMES = [
  { value: '08:00', label: 'Morning' },
  { value: '12:00', label: 'Midday' },
  { value: '18:00', label: 'Evening' },
  { value: '22:00', label: 'Bedtime' },
];

/** Injection sites, in the order Ferro rotates through them. */
export const SITES = [
  'Left abdomen',
  'Right abdomen',
  'Left thigh',
  'Right thigh',
  'Left glute',
  'Right glute',
  'Left delt',
  'Right delt',
];

// ---- types --------------------------------------------------------------------

export type Compound = {
  id: string;
  name: string;
  kind: CompoundKind;
  form: CompoundForm;
  unit: string;
  default_amount: number | null;
  schedule: Schedule;
  /** Parsed from JSON. */
  schedule_days: number[];
  every_n: number | null;
  /** Parsed from JSON, sorted, e.g. ["08:00", "22:00"]. */
  times: string[];
  started_at: number;
  ended_at: number | null;
  notes: string | null;
  created_at: number;
};

export type Dose = {
  id: string;
  compound_id: string;
  amount: number | null;
  unit: string;
  taken_at: number;
  site: string | null;
  notes: string | null;
};

export type CompoundInput = Pick<
  Compound,
  'name' | 'kind' | 'form' | 'unit' | 'default_amount' | 'schedule' | 'schedule_days' | 'every_n' | 'times' | 'notes'
>;

type CompoundRow = Omit<Compound, 'schedule_days' | 'times'> & { schedule_days: string; times: string };

function parseList<T>(json: string, fallback: T[]): T[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v : fallback;
  } catch {
    // A bad value shouldn't break the screen; use the fallback instead.
    return fallback;
  }
}

function rowToCompound(row: CompoundRow): Compound {
  return {
    ...row,
    schedule_days: parseList<number>(row.schedule_days, []),
    times: parseList<string>(row.times, ['08:00']).slice().sort(),
  };
}

// ---- reading ------------------------------------------------------------------

/** All compounds: active ones first (A–Z), then finished ones. */
export async function getCompounds(db: SQLiteDatabase) {
  const rows = await db.getAllAsync<CompoundRow>(
    'SELECT * FROM compounds ORDER BY ended_at IS NOT NULL, name COLLATE NOCASE',
  );
  return rows.map(rowToCompound);
}

export async function getCompound(db: SQLiteDatabase, id: string) {
  const row = await db.getFirstAsync<CompoundRow>('SELECT * FROM compounds WHERE id = ?', id);
  return row ? rowToCompound(row) : null;
}

/** Doses taken between two times (ms), oldest first. */
export async function getDosesBetween(db: SQLiteDatabase, from: number, to: number) {
  return db.getAllAsync<Dose>(
    'SELECT * FROM doses WHERE taken_at >= ? AND taken_at < ? ORDER BY taken_at',
    from,
    to,
  );
}

/** A compound's most recent doses, newest first. */
export async function getRecentDoses(db: SQLiteDatabase, compoundId: string, limit = 20) {
  return db.getAllAsync<Dose>(
    'SELECT * FROM doses WHERE compound_id = ? ORDER BY taken_at DESC LIMIT ?',
    compoundId,
    limit,
  );
}

/** The newest dose of each compound (for "last taken" on as-needed items). */
export async function getLastDoses(db: SQLiteDatabase) {
  const rows = await db.getAllAsync<{ compound_id: string; taken_at: number }>(
    'SELECT compound_id, MAX(taken_at) AS taken_at FROM doses GROUP BY compound_id',
  );
  return new Map(rows.map((r) => [r.compound_id, r.taken_at]));
}

export async function getDose(db: SQLiteDatabase, id: string) {
  return db.getFirstAsync<Dose>('SELECT * FROM doses WHERE id = ?', id);
}

// ---- writing ------------------------------------------------------------------

function inputValues(c: CompoundInput) {
  return [
    c.name.trim(),
    c.kind,
    c.form,
    c.unit,
    c.default_amount,
    c.schedule,
    JSON.stringify(c.schedule_days),
    c.schedule === 'every_n' ? c.every_n : null,
    JSON.stringify(c.times),
    c.notes?.trim() || null,
  ] as const;
}

export async function addCompound(db: SQLiteDatabase, c: CompoundInput) {
  const id = newId();
  const now = Date.now();
  await db.runAsync(
    `INSERT INTO compounds (name, kind, form, unit, default_amount, schedule, schedule_days, every_n, times, notes,
       id, started_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ...inputValues(c),
    id,
    now,
    now,
  );
  notifyMedsChanged();
  return id;
}

export async function updateCompound(db: SQLiteDatabase, id: string, c: CompoundInput) {
  await db.runAsync(
    `UPDATE compounds SET name = ?, kind = ?, form = ?, unit = ?, default_amount = ?, schedule = ?,
       schedule_days = ?, every_n = ?, times = ?, notes = ?
     WHERE id = ?`,
    ...inputValues(c),
    id,
  );
  notifyMedsChanged();
}

/** Finished = stops showing on Today, but its doses are kept. Pass null to start it again. */
export async function setCompoundEnded(db: SQLiteDatabase, id: string, endedAt: number | null) {
  await db.runAsync('UPDATE compounds SET ended_at = ? WHERE id = ?', endedAt, id);
  notifyMedsChanged();
}

/** Deletes a compound and every dose logged for it (ON DELETE CASCADE). */
export async function deleteCompound(db: SQLiteDatabase, id: string) {
  await db.runAsync('DELETE FROM compounds WHERE id = ?', id);
  notifyMedsChanged();
}

export type DoseInput = Pick<Dose, 'amount' | 'unit' | 'taken_at' | 'site' | 'notes'>;

export async function logDose(db: SQLiteDatabase, compoundId: string, d: DoseInput) {
  const id = newId();
  await db.runAsync(
    'INSERT INTO doses (id, compound_id, amount, unit, taken_at, site, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
    id,
    compoundId,
    d.amount,
    d.unit,
    d.taken_at,
    d.site,
    d.notes?.trim() || null,
  );
  notifyMedsChanged();
  return id;
}

export async function updateDose(db: SQLiteDatabase, id: string, d: DoseInput) {
  await db.runAsync(
    'UPDATE doses SET amount = ?, unit = ?, taken_at = ?, site = ?, notes = ? WHERE id = ?',
    d.amount,
    d.unit,
    d.taken_at,
    d.site,
    d.notes?.trim() || null,
    id,
  );
  notifyMedsChanged();
}

export async function deleteDose(db: SQLiteDatabase, id: string) {
  await db.runAsync('DELETE FROM doses WHERE id = ?', id);
  notifyMedsChanged();
}

// ---- schedules (plain functions, no database) ----------------------------------

/** Midnight at the start of the day `ms` falls on, in the phone's time zone. */
export function startOfDay(ms: number) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Midnight at the start of the next day (handles daylight saving: not always +24 h). */
export function startOfNextDay(ms: number) {
  const d = new Date(startOfDay(ms));
  d.setDate(d.getDate() + 1);
  return d.getTime();
}

/** Whole calendar days from a to b. Uses the date only, so daylight saving can't shift it. */
function daysBetween(a: number, b: number) {
  const da = new Date(a);
  const db = new Date(b);
  const utcA = Date.UTC(da.getFullYear(), da.getMonth(), da.getDate());
  const utcB = Date.UTC(db.getFullYear(), db.getMonth(), db.getDate());
  return Math.round((utcB - utcA) / 86_400_000);
}

/** Is this compound scheduled on the day that `day` falls on? As-needed ones never are. */
export function isDueOn(c: Compound, day: number) {
  const dayStart = startOfDay(day);
  if (startOfDay(c.started_at) > dayStart) return false; // not started yet
  if (c.ended_at !== null && c.ended_at < dayStart) return false; // finished before this day
  switch (c.schedule) {
    case 'daily':
      return true;
    case 'days':
      return c.schedule_days.includes(new Date(dayStart).getDay());
    case 'every_n': {
      const n = c.every_n && c.every_n > 0 ? c.every_n : 1;
      return daysBetween(c.started_at, dayStart) % n === 0;
    }
    default:
      return false;
  }
}

/** One expected dose on Today, e.g. "Accutane, morning". */
export type Slot = {
  key: string;
  compound: Compound;
  time: string; // "HH:MM"
  /** The dose that ticks this slot off, if taken. */
  dose: Dose | null;
};

/**
 * Today's slots, in time order. A compound with two times gets two slots.
 * Doses fill slots in order: your first dose of the day ticks off the first
 * time, the second dose the second time, and so on, whatever time you
 * actually took them.
 */
export function buildSlots(compounds: Compound[], todaysDoses: Dose[], day: number): Slot[] {
  const slots: Slot[] = [];
  for (const c of compounds) {
    if (!isDueOn(c, day)) continue;
    const doses = todaysDoses.filter((d) => d.compound_id === c.id); // already oldest first
    c.times.forEach((time, i) => {
      slots.push({ key: `${c.id}-${i}`, compound: c, time, dose: doses[i] ?? null });
    });
  }
  return slots.sort((a, b) => a.time.localeCompare(b.time) || a.compound.name.localeCompare(b.compound.name));
}

/** "08:00" → "8:00 am". */
export function formatClock(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(2000, 0, 1, h, m);
  return formatTime(d.getTime());
}

/** A time like "8:04 am". */
export function formatTime(ms: number) {
  return new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }).toLowerCase();
}

/** Which part of the day a "HH:MM" time is in, for grouping Today. */
export function partOfDay(hhmm: string) {
  const h = Number(hhmm.slice(0, 2));
  if (h < 12) return 'Morning';
  if (h < 17) return 'Afternoon';
  return 'Evening';
}

/** What you typed in an amount box: "" → null, "2,5" or "2.5" → 2.5, anything else → 'invalid'. */
export function parseAmount(text: string): number | null | 'invalid' {
  const t = text.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : 'invalid';
}

/** "500 mg", "2 pills", or "" if there's no amount. */
export function formatAmount(amount: number | null, unit: string) {
  if (amount === null) return '';
  return `${String(Number(amount.toFixed(3)))} ${unit}`;
}

/** Plain-English schedule, e.g. "Mon, Wed, Fri · morning". */
export function describeSchedule(c: Pick<Compound, 'schedule' | 'schedule_days' | 'every_n' | 'times'>) {
  const when = c.times.map((t) => (TIMES.find((x) => x.value === t)?.label ?? formatClock(t)).toLowerCase()).join(' + ');
  switch (c.schedule) {
    case 'daily':
      return `Every day · ${when}`;
    case 'days':
      return `${c.schedule_days.length ? c.schedule_days.slice().sort().map((d) => WEEKDAYS[d]).join(', ') : 'No days picked'} · ${when}`;
    case 'every_n':
      return `Every ${c.every_n ?? 1} days · ${when}`;
    default:
      return 'As needed';
  }
}

/**
 * The site to suggest next: the one after the last site you used, so
 * injections rotate around the body instead of hitting the same spot.
 */
export function nextSite(lastSite: string | null) {
  if (!lastSite) return SITES[0];
  const i = SITES.indexOf(lastSite);
  return i === -1 ? SITES[0] : SITES[(i + 1) % SITES.length];
}

// ---- hooks for screens ----------------------------------------------------------

export type MedsToday = {
  compounds: Compound[];
  slots: Slot[];
  /** Active as-needed compounds, with when you last took each. */
  asNeeded: { compound: Compound; lastTakenAt: number | null }[];
};

/** Everything the Meds tab shows. undefined while loading. Re-loads on changes and at midnight. */
export function useMedsToday() {
  const db = useSQLiteContext();
  const changes = useMedsVersion();
  const today = useToday();
  const [data, setData] = useState<MedsToday | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const compounds = await getCompounds(db);
      const doses = await getDosesBetween(db, today, startOfNextDay(today));
      const last = await getLastDoses(db);
      if (cancelled) return;
      setData({
        compounds,
        slots: buildSlots(compounds, doses, today),
        asNeeded: compounds
          .filter((c) => c.schedule === 'as_needed' && c.ended_at === null)
          .map((compound) => ({ compound, lastTakenAt: last.get(compound.id) ?? null })),
      });
    })().catch((err) => console.warn('Could not load meds', err));
    return () => {
      cancelled = true;
    };
  }, [db, changes, today]);

  return data;
}

/** Start of today, updating when the day changes while the app is open. */
function useToday() {
  const [today, setToday] = useState(() => startOfDay(Date.now()));
  useEffect(() => {
    const t = setTimeout(() => setToday(startOfDay(Date.now())), startOfNextDay(today) - Date.now() + 1000);
    return () => clearTimeout(t);
  }, [today]);
  return today;
}
