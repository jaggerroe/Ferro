import { NativeTabs } from 'expo-router/native-tabs';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useSettings } from '@/lib/settings';

/**
 * The bottom tab bar. `sf` icons are Apple SF Symbols (iOS),
 * `md` icons are Material Symbols (Android).
 *
 * Meds and Routines share one spot: iPhones only show 5 tabs, so turning
 * on the Meds tab (Profile → Meds & supplements) hides Routines, and your
 * routines show on the Workout tab instead.
 */
export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const { showMedsTab } = useSettings();

  return (
    <NativeTabs
      backgroundColor={colors.background}
      indicatorColor={colors.backgroundSelected}
      tintColor={colors.accent}
      labelStyle={{ selected: { color: colors.accent } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Workout</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="dumbbell.fill" md="fitness_center" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="history">
        <NativeTabs.Trigger.Label>History</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="clock.fill" md="history" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="progress">
        <NativeTabs.Trigger.Label>Progress</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="chart.line.uptrend.xyaxis" md="trending_up" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="routines" hidden={showMedsTab}>
        <NativeTabs.Trigger.Label>Routines</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="list.bullet.rectangle.fill" md="list_alt" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="meds" hidden={!showMedsTab}>
        <NativeTabs.Trigger.Label>Meds</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="pills.fill" md="medication" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="friends">
        <NativeTabs.Trigger.Label>Friends</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="person.2.fill" md="group" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
