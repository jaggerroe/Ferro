import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { useEffect, useState } from 'react';

import { newId } from '@/db/migrations';
import { notifyMedsChanged, startOfDay, useMedsVersion, type Compound } from '@/lib/meds';

/**
 * Side effects and lab results, shown on the Meds tab (Check-ins and Labs).
 * Same rules as meds.ts: private, backed up, and Ferro only records what
 * you enter. It doesn't judge results; "high" or "low" only compares a value
 * to the normal range you copied from your own lab report.
 *
 * Changes use the meds change signal (notifyMedsChanged), so the Meds tab
 * and backups pick them up like doses.
 */

// ---- check-ins ------------------------------------------------------------------

/** Common things to track. You can add your own; they show up once you've rated them. */
export const DEFAULT_TAGS = [
  'Dry lips',
  'Dry skin',
  'Dry eyes',
  'Joint aches',
  'Headache',
  'Tired',
  'Low mood',
  'Poor sleep',
  'Acne',
  'Nosebleed',
  'Nausea',
];

export const SEVERITIES = [
  { value: 1, label: 'Mild' },
  { value: 2, label: 'Moderate' },
  { value: 3, label: 'Bad' },
] as const;
export type Severity = 1 | 2 | 3;

export type CheckIn = { id: string; day: string; tag: string; severity: Severity; created_at: number };

/** "2026-11-13" for the day `ms` falls on, on the phone's calendar. */
export function dayKey(ms: number) {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The last `count` day keys, oldest first, ending with the day `now` falls on. */
export function lastDays(now: number, count: number) {
  const days: string[] = [];
  const d = new Date(startOfDay(now));
  d.setDate(d.getDate() - (count - 1));
  for (let i = 0; i < count; i++) {
    days.push(dayKey(d.getTime()));
    d.setDate(d.getDate() + 1); // calendar days, so daylight saving can't skip or repeat one
  }
  return days;
}

export async function getCheckIns(db: SQLiteDatabase, fromDay: string, toDay: string) {
  return db.getAllAsync<CheckIn>(
    'SELECT * FROM check_ins WHERE day >= ? AND day <= ? ORDER BY day, tag',
    fromDay,
    toDay,
  );
}

/** Every tag you've ever rated, A–Z (so your own tags stick around). */
export async function getUsedTags(db: SQLiteDatabase) {
  const rows = await db.getAllAsync<{ tag: string }>('SELECT DISTINCT tag FROM check_ins ORDER BY tag COLLATE NOCASE');
  return rows.map((r) => r.tag);
}

/** Rates a tag for a day. `null` clears it. */
export async function setCheckIn(db: SQLiteDatabase, day: string, tag: string, severity: Severity | null) {
  const existing = await db.getFirstAsync<{ id: string }>('SELECT id FROM check_ins WHERE day = ? AND tag = ?', day, tag);
  if (severity === null) {
    if (existing) await db.runAsync('DELETE FROM check_ins WHERE id = ?', existing.id);
  } else if (existing) {
    await db.runAsync('UPDATE check_ins SET severity = ? WHERE id = ?', severity, existing.id);
  } else {
    await db.runAsync(
      'INSERT INTO check_ins (id, day, tag, severity, created_at) VALUES (?, ?, ?, ?, ?)',
      newId(),
      day,
      tag,
      severity,
      Date.now(),
    );
  }
  notifyMedsChanged();
}

/** Tap order for a tag: not rated → mild → moderate → bad → not rated. */
export function nextSeverity(current: Severity | null): Severity | null {
  if (current === null) return 1;
  return current === 3 ? null : ((current + 1) as Severity);
}

/** Tags to show: the common ones, then any of your own, without duplicates (ignoring case). */
export function mergeTags(...lists: string[][]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    for (const t of list) {
      const key = t.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(t.trim());
    }
  }
  return out;
}

export type CheckInData = {
  days: string[]; // last 7, oldest first
  /** tag → day → severity */
  grid: Map<string, Map<string, Severity>>;
  usedTags: string[];
};

/** The last 7 days of check-ins, for the Check-ins view. undefined while loading. */
export function useCheckIns() {
  const db = useSQLiteContext();
  const changes = useMedsVersion();
  const [data, setData] = useState<CheckInData | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const days = lastDays(Date.now(), 7);
      const rows = await getCheckIns(db, days[0], days[days.length - 1]);
      const usedTags = await getUsedTags(db);
      if (cancelled) return;
      const grid = new Map<string, Map<string, Severity>>();
      for (const r of rows) {
        if (!grid.has(r.tag)) grid.set(r.tag, new Map());
        grid.get(r.tag)!.set(r.day, r.severity);
      }
      setData({ days, grid, usedTags });
    })().catch((err) => console.warn('Could not load check-ins', err));
    return () => {
      cancelled = true;
    };
  }, [db, changes]);
  return data;
}

// ---- lab results -------------------------------------------------------------------

export type LabResult = {
  id: string;
  drawn_at: number;
  marker: string;
  value: number;
  unit: string;
  ref_low: number | null;
  ref_high: number | null;
  notes: string | null;
  created_at: number;
};

export type LabInput = Pick<LabResult, 'drawn_at' | 'marker' | 'value' | 'unit' | 'ref_low' | 'ref_high' | 'notes'>;

/** Suggestions for the marker box (you can type anything). Common on routine and Accutane panels. */
export const COMMON_MARKERS = [
  'ALT',
  'AST',
  'Triglycerides',
  'Total cholesterol',
  'LDL',
  'HDL',
  'Glucose',
  'Testosterone',
  'Estradiol',
  'Hematocrit',
  'Hemoglobin',
];
export const COMMON_LAB_UNITS = ['mg/dL', 'U/L', 'ng/dL', 'pg/mL', '%', 'g/dL', 'mmol/L'];

export async function getLabResults(db: SQLiteDatabase) {
  return db.getAllAsync<LabResult>('SELECT * FROM lab_results ORDER BY drawn_at, created_at');
}

export async function getLabResult(db: SQLiteDatabase, id: string) {
  return db.getFirstAsync<LabResult>('SELECT * FROM lab_results WHERE id = ?', id);
}

export async function addLabResult(db: SQLiteDatabase, r: LabInput) {
  const id = newId();
  await db.runAsync(
    `INSERT INTO lab_results (id, drawn_at, marker, value, unit, ref_low, ref_high, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    r.drawn_at,
    r.marker.trim(),
    r.value,
    r.unit.trim(),
    r.ref_low,
    r.ref_high,
    r.notes?.trim() || null,
    Date.now(),
  );
  notifyMedsChanged();
  return id;
}

export async function updateLabResult(db: SQLiteDatabase, id: string, r: LabInput) {
  await db.runAsync(
    'UPDATE lab_results SET drawn_at = ?, marker = ?, value = ?, unit = ?, ref_low = ?, ref_high = ?, notes = ? WHERE id = ?',
    r.drawn_at,
    r.marker.trim(),
    r.value,
    r.unit.trim(),
    r.ref_low,
    r.ref_high,
    r.notes?.trim() || null,
    id,
  );
  notifyMedsChanged();
}

export async function deleteLabResult(db: SQLiteDatabase, id: string) {
  await db.runAsync('DELETE FROM lab_results WHERE id = ?', id);
  notifyMedsChanged();
}

/** Compared with the range from your lab report. null if in range or no range given. */
export function rangeFlag(r: Pick<LabResult, 'value' | 'ref_low' | 'ref_high'>): 'High' | 'Low' | null {
  if (r.ref_high !== null && r.value > r.ref_high) return 'High';
  if (r.ref_low !== null && r.value < r.ref_low) return 'Low';
  return null;
}

export type Marker = {
  /** Lowercase, for matching "alt" with "ALT". */
  key: string;
  /** As you typed it most recently. */
  name: string;
  /** Oldest first. */
  results: LabResult[];
  latest: LabResult;
};

/** Groups results by marker (ignoring case), most recently tested marker first. */
export function groupByMarker(results: LabResult[]): Marker[] {
  const map = new Map<string, LabResult[]>();
  for (const r of results) {
    const key = markerKey(r.marker);
    map.set(key, [...(map.get(key) ?? []), r]);
  }
  return [...map.entries()]
    .map(([key, list]) => {
      const sorted = list.slice().sort((a, b) => a.drawn_at - b.drawn_at || a.created_at - b.created_at);
      const latest = sorted[sorted.length - 1];
      return { key, name: latest.marker, results: sorted, latest };
    })
    .sort((a, b) => b.latest.drawn_at - a.latest.drawn_at || a.name.localeCompare(b.name));
}

export function markerKey(marker: string) {
  return marker.trim().toLowerCase();
}

/** Names of the compounds you were taking on a given day (to see what a lab result happened during). */
export function activeOn(compounds: Compound[], day: number) {
  const start = startOfDay(day);
  return compounds
    .filter((c) => startOfDay(c.started_at) <= start && (c.ended_at === null || c.ended_at >= start))
    .map((c) => c.name);
}

/** All lab results, grouped by marker. undefined while loading. */
export function useLabMarkers() {
  const db = useSQLiteContext();
  const changes = useMedsVersion();
  const [markers, setMarkers] = useState<Marker[] | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    getLabResults(db)
      .then((rows) => {
        if (!cancelled) setMarkers(groupByMarker(rows));
      })
      .catch((err) => console.warn('Could not load lab results', err));
    return () => {
      cancelled = true;
    };
  }, [db, changes]);
  return markers;
}

// ---- dates you type -------------------------------------------------------------------

/** "11/13/2026" for a time. */
export function formatDateInput(ms: number) {
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

/**
 * Reads "11/13/2026" (or 11-13-2026, or 11/13/26) as noon on that day,
 * so time zones can't move it to a different date. null if it isn't a real date.
 */
export function parseDateInput(text: string): number | null {
  const m = text.trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (!m) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const d = new Date(year, month - 1, day, 12);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null; // e.g. 2/30
  return d.getTime();
}

/** "Nov 13, 2026". */
export function formatLabDate(ms: number) {
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
