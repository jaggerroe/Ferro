import { router } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { PlaceholderCard } from '@/components/placeholder-card';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function WorkoutScreen() {
  const theme = useTheme();

  return (
    <Screen title="Workout">
      <PlaceholderCard
        eyebrow="Suggested for today"
        title="Leg Day"
        body="Ferro will suggest what to train based on which muscle groups you've hit recently."
      />
      <Pressable
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.startButton,
          { backgroundColor: theme.accent, opacity: pressed ? 0.8 : 1 },
        ]}>
        <ThemedText style={[styles.startLabel, { color: theme.onAccent }]}>
          Start empty workout
        </ThemedText>
      </Pressable>
      <Pressable
        onPress={() => router.push('/exercises')}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.secondaryButton,
          { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.8 : 1 },
        ]}>
        <ThemedText style={styles.secondaryLabel}>Browse exercises</ThemedText>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  startButton: {
    borderRadius: 14,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  startLabel: {
    fontSize: 17,
    fontWeight: 800,
  },
  secondaryButton: {
    borderRadius: 14,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  secondaryLabel: {
    fontSize: 17,
    fontWeight: 700,
  },
});
