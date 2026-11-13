import { Pressable, StyleSheet } from 'react-native';

import { RoutineList, useNewRoutine } from '@/components/routine-list';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useRoutines } from '@/lib/routines';

/** The Routines tab. Hidden while the Meds tab is on; routines then show on the Workout tab. */
export default function RoutinesScreen() {
  const theme = useTheme();
  const routines = useRoutines();
  const newRoutine = useNewRoutine();

  if (routines === undefined) return <Screen title="Routines" />;

  return (
    <Screen title="Routines">
      <Pressable
        onPress={newRoutine}
        accessibilityRole="button"
        style={({ pressed }) => [styles.newButton, { backgroundColor: theme.accent, opacity: pressed ? 0.8 : 1 }]}>
        <ThemedText style={[styles.newLabel, { color: theme.onAccent }]}>+ New routine</ThemedText>
      </Pressable>

      <RoutineList routines={routines} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  newButton: { borderRadius: 14, paddingVertical: Spacing.three, alignItems: 'center' },
  newLabel: { fontSize: 17, fontWeight: 800 },
});
