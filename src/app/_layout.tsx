import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SQLiteProvider } from 'expo-sqlite';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { DATABASE_NAME, migrateDbIfNeeded } from '@/db/migrations';

SplashScreen.preventAutoHideAsync();

/**
 * Root navigator. The five tabs live in the (tabs) group; the profile
 * screen slides up over them as a modal.
 *
 * SQLiteProvider opens the on-device database and runs any pending
 * migrations before the screens load, so every screen can use
 * `useSQLiteContext()` to read and write data.
 */
export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <SQLiteProvider databaseName={DATABASE_NAME} onInit={migrateDbIfNeeded}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="profile" options={{ presentation: 'modal' }} />
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
