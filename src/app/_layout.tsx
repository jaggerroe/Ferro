import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { SyncManager } from '@/components/sync-manager';
import { initDatabase } from '@/db/init';
import { DATABASE_NAME } from '@/db/migrations';
import { useColorScheme } from '@/hooks/use-color-scheme';

SplashScreen.preventAutoHideAsync();

/**
 * Root navigator. The five tabs live in the (tabs) group; the profile
 * screen slides up over them as a modal.
 *
 * SQLiteProvider opens the on-device database, runs any pending migrations
 * and loads your settings before the screens load, so every screen can use
 * `useSQLiteContext()` to read and write data.
 *
 * useColorScheme follows the Theme setting (System, Light or Dark).
 */
export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      <AnimatedSplashOverlay />
      <SQLiteProvider databaseName={DATABASE_NAME} onInit={initDatabase}>
        {/* Backs up in the background while you're signed in. */}
        <SyncManager />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="profile" options={{ presentation: 'modal' }} />
          <Stack.Screen name="account" options={{ presentation: 'modal' }} />
          <Stack.Screen name="exercises" options={{ presentation: 'modal' }} />
          <Stack.Screen name="new-exercise" options={{ presentation: 'modal' }} />
          {/* Full screen, and no swipe-down to close, so a workout isn't dismissed by accident. */}
          <Stack.Screen name="workout" options={{ presentation: 'fullScreenModal', gestureEnabled: false }} />
          <Stack.Screen name="workouts/[id]" options={{ presentation: 'modal' }} />
          <Stack.Screen name="exercise-progress/[id]" options={{ presentation: 'modal' }} />
          <Stack.Screen name="routine/[id]" options={{ presentation: 'modal' }} />
        </Stack>
      </SQLiteProvider>
    </ThemeProvider>
  );
}
