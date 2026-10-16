import type { SQLiteDatabase } from 'expo-sqlite';

import { migrateDbIfNeeded } from '@/db/migrations';
import { loadSettings } from '@/lib/settings';

/** Everything that runs when the database opens, before any screen shows. */
export async function initDatabase(db: SQLiteDatabase) {
  await migrateDbIfNeeded(db);
  await loadSettings(db);
}
