import type { SQLiteDatabase } from 'expo-sqlite';
import { useSyncExternalStore } from 'react';

import { setRestTarget } from '@/lib/rest';

/**
 * Your settings, saved in the `settings` table and kept in memory so any
 * screen can read them instantly.
 *
 * WEIGHTS: the database always stores pounds. Choosing kg only changes what
 * you see and type; the conversion happens at the screen (toDisplayWeight /
 * fromDisplayWeight). That way switching units never rewrites your history.
 */

export type WeightUnit = 'lb' | 'kg';
export type ThemePreference = 'system' | 'light' | 'dark';

export type Settings = {
  weightUnit: WeightUnit;
  /** Default rest time in seconds, or null for "No limit". */
  restSec: number | null;
  theme: ThemePreference;
};

const DEFAULTS: Settings = { weightUnit: 'lb', restSec: 120, theme: 'system' };

let state: Settings = DEFAULTS;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
const getState = () => state;

/** Current settings. Screens using this re-render when a setting changes. */
export function useSettings() {
  return useSyncExternalStore(subscribe, getState, getState);
}

/** Current settings without subscribing (for helpers outside components). */
export function getSettings() {
  return state;
}

/** Reads saved settings into memory. Runs once at app start, right after migrations. */
export async function loadSettings(db: SQLiteDatabase) {
  const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM settings');
  const saved: Partial<Settings> = {};
  for (const { key, value } of rows) {
    try {
      (saved as Record<string, unknown>)[key] = JSON.parse(value);
    } catch {
      // Ignore a corrupt value; the default is used instead.
    }
  }
  state = { ...DEFAULTS, ...pickValid(saved) };
  setRestTarget(state.restSec);
  listeners.forEach((l) => l());
}

/** Changes one setting and saves it. */
export async function saveSetting<K extends keyof Settings>(db: SQLiteDatabase, key: K, value: Settings[K]) {
  state = { ...state, [key]: value };
  listeners.forEach((l) => l());
  await db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', key, JSON.stringify(value));
}

/** Drops anything that isn't a valid value, so a bad row can't break the app. */
function pickValid(s: Partial<Settings>): Partial<Settings> {
  const out: Partial<Settings> = {};
  if (s.weightUnit === 'lb' || s.weightUnit === 'kg') out.weightUnit = s.weightUnit;
  if (s.restSec === null || (typeof s.restSec === 'number' && s.restSec > 0)) out.restSec = s.restSec;
  if (s.theme === 'system' || s.theme === 'light' || s.theme === 'dark') out.theme = s.theme;
  return out;
}

// ---- weight units -------------------------------------------------------------

export const KG_PER_LB = 0.45359237;

/** Pounds (as stored) → the number you see in your chosen unit. */
export function toDisplayWeight(lb: number) {
  return state.weightUnit === 'kg' ? lb * KG_PER_LB : lb;
}

/** A number you typed in your chosen unit → pounds (to store). */
export function fromDisplayWeight(value: number) {
  return state.weightUnit === 'kg' ? value / KG_PER_LB : value;
}

export function weightUnitLabel() {
  return state.weightUnit;
}

/** 135 → "135 lb" or "61.2 kg". */
export function formatWeight(lb: number) {
  const n = toDisplayWeight(lb);
  const decimals = state.weightUnit === 'kg' ? 1 : 2;
  return `${String(Number(n.toFixed(decimals)))} ${state.weightUnit}`;
}

/** Whole numbers with commas, for big totals: 12450 → "12,450 lb" or "5,647 kg". */
export function formatWeightRounded(lb: number) {
  return `${Math.round(toDisplayWeight(lb)).toLocaleString()} ${state.weightUnit}`;
}

/** A weight for an input box: no unit, up to 2 decimals. 135 → "135", in kg → "61.23". */
export function weightToInput(lb: number) {
  return String(Number(toDisplayWeight(lb).toFixed(2)));
}
