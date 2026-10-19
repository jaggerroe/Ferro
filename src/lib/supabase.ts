import 'expo-sqlite/localStorage/install';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

/**
 * The connection to Ferro's backend (Supabase). Set up per Expo's guide:
 * https://docs.expo.dev/guides/using-supabase/
 *
 * The URL and publishable key come from `.env.local` (kept out of Git). The
 * publishable key is meant to ship inside the app; Row Level Security on
 * the database is what keeps each person's data private.
 *
 * If the keys aren't set yet, `supabase` is null and the app works offline
 * as before. Accounts just show "not set up yet".
 */

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const isBackendConfigured = Boolean(url && publishableKey);

export const supabase: SupabaseClient | null = isBackendConfigured
  ? createClient(url!, publishableKey!, {
      auth: {
        // Keeps you signed in between launches (saved on the phone via expo-sqlite).
        storage: localStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;

// Only refresh the sign-in token while the app is open, as the guide recommends.
if (supabase) {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
