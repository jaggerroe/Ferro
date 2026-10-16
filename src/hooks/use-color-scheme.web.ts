import { useEffect, useState } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

import { useSettings } from '@/lib/settings';

/**
 * To support static rendering, this value needs to be re-calculated on the client side for web
 */
export function useColorScheme() {
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  const system = useRNColorScheme();
  const { theme } = useSettings();
  const colorScheme = theme === 'system' ? system : theme;

  if (hasHydrated) {
    return colorScheme;
  }

  return 'light';
}
