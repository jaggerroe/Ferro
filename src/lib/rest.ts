import { useSyncExternalStore } from 'react';

/**
 * The rest timer's state. It lives outside any screen so it keeps running
 * if you hide the workout screen. The rest time starts from your saved
 * default (Profile → Default rest time), and changing it in the rest bar
 * saves it as your new default.
 */

export type RestState = {
  /** When you pressed Start (ms since 1970), or null if the timer isn't running. */
  startedAt: number | null;
  /** Your rest time in seconds, or null for "No limit" (plain stopwatch). */
  targetSec: number | null;
};

export const REST_PRESETS = [30, 60, 90, 120, 180, 300];
export const MIN_REST_SEC = 15;
export const MAX_REST_SEC = 60 * 60;

let state: RestState = { startedAt: null, targetSec: 120 };
const listeners = new Set<() => void>();

function set(next: Partial<RestState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getState = () => state;

export function useRest() {
  return useSyncExternalStore(subscribe, getState, getState);
}

export const startRest = () => set({ startedAt: Date.now() });
export const stopRest = () => set({ startedAt: null });

export function setRestTarget(targetSec: number | null) {
  set({ targetSec: targetSec === null ? null : clamp(targetSec) });
}

/** Nudge the rest time by ±seconds (starts from 2:00 if it was "No limit"). */
export function adjustRestTarget(deltaSec: number) {
  setRestTarget((state.targetSec ?? 120) + deltaSec);
}

function clamp(sec: number) {
  return Math.min(MAX_REST_SEC, Math.max(MIN_REST_SEC, Math.round(sec)));
}
