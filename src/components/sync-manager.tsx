import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { useSession } from '@/lib/auth';
import { useCustomExercisesVersion } from '@/lib/custom-exercises';
import { useSettings } from '@/lib/settings';
import { loadSyncStatus, syncNow } from '@/lib/sync';
import { useWorkoutsVersion } from '@/lib/workouts';

/** Wait this long after the last change before backing up, so a workout isn't uploaded set by set. */
const DEBOUNCE_MS = 15_000;

/**
 * Invisible. While you're signed in, it backs up:
 * - right after you sign in (or open the app signed in),
 * - 15 seconds after your data stops changing,
 * - whenever the app goes to the background.
 */
export function SyncManager() {
  const db = useSQLiteContext();
  const session = useSession();
  const userId = session?.user.id;
  const workoutsVersion = useWorkoutsVersion();
  const customVersion = useCustomExercisesVersion();
  const settings = useSettings();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstChange = useRef(true);

  useEffect(() => {
    loadSyncStatus(db).catch(() => {});
  }, [db]);

  // Sign-in / app start.
  useEffect(() => {
    if (userId) syncNow(db, userId);
  }, [db, userId]);

  // Data changed: back up a little later.
  useEffect(() => {
    if (firstChange.current) {
      firstChange.current = false;
      return;
    }
    if (!userId) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => syncNow(db, userId), DEBOUNCE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [db, userId, workoutsVersion, customVersion, settings]);

  // Leaving the app: back up now.
  useEffect(() => {
    if (!userId) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        if (timer.current) clearTimeout(timer.current);
        syncNow(db, userId);
      }
    });
    return () => sub.remove();
  }, [db, userId]);

  return null;
}
