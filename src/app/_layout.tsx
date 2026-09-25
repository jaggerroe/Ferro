import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';

SplashScreen.preventAutoHideAsync();

/**
 * Root navigator. The five tabs live in the (tabs) group; the profile
 * screen slides up over them as a modal.
 */
export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="profile" options={{ presentation: 'modal' }} />
        <Stack.Screen name="exercises" options={{ presentation: 'modal' }} />
      </Stack>
    </ThemeProvider>
  );
}
