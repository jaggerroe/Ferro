import { useColorScheme as useSystemColorScheme } from 'react-native';

import { useSettings } from '@/lib/settings';

/**
 * 'light' or 'dark' for the app. Follows the phone unless you picked Light
 * or Dark under Profile → Theme.
 */
export function useColorScheme() {
  const system = useSystemColorScheme();
  const { theme } = useSettings();
  return theme === 'system' ? system : theme;
}
