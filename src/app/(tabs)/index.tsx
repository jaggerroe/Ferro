import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { PlaceholderCard } from '@/components/placeholder-card';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useStartRoutine } from '@/hooks/use-start-routine';
import { useTheme } from '@/hooks/use-theme';
import { useRoutines } from '@/lib/routines';
import { formatDuration, startWorkout, useActiveWorkout } from '@/lib/workouts';

export default function WorkoutScreen() {
  const theme = useTheme();
  const db = useSQLiteContext();
  const active = useActiveWorkout();
  const routines = useRoutines();
  const startRoutine = useStartRoutine();
  const [starting, setStarting] = useState(false);
  // Up to 3 routines that have exercises, most recently used first.
  const quickRoutines = (routines ?? []).filter((r) => r.exercises.length > 0).slice(0, 3);

  async function start() {
    if (starting) return;
    setStarting(true);
    try {
      await startWorkout(db);
      router.push('/workout');
    } catch (err) {
      console.warn('Could not start workout', err);
      Alert.alert("Couldn't start workout", 'Something went wrong. Try again.');
    } finally {
      setStarting(false);
    }
  }

  return (
    <Screen title="Workout">
      {active ? (
        <Pressable onPress={() => router.push('/workout')} accessibilityRole="button">
          {({ pressed }) => (
            <ThemedView
              type="backgroundElement"
              style={[styles.activeCard, { borderColor: theme.accent, opacity: pressed ? 0.8 : 1 }]}>
              <ThemedText type="smallBold" themeColor="accent" style={styles.eyebrow}>
                In progress
              </ThemedText>
              <ThemedText style={styles.activeTitle}>{active.name || 'Workout'}</ThemedText>
              <ElapsedText startedAt={active.started_at} />
              <ThemedView style={[styles.resume, { backgroundColor: theme.accent }]}>
                <ThemedText style={[styles.startLabel, { color: theme.onAccent }]}>Resume workout</ThemedText>
              </ThemedView>
            </ThemedView>
          )}
        </Pressable>
      ) : (
        <>
          {quickRoutines.length > 0 ? (
            <View style={styles.routines}>
              <View style={styles.routinesHeader}>
                <ThemedText type="smallBold" themeColor="textSecondary" style={styles.eyebrow}>
                  Start a routine
                </ThemedText>
                <Pressable onPress={() => router.push('/routines')} accessibilityRole="button" hitSlop={8}>
                  <ThemedText type="smallBold" themeColor="accent">
                    All routines
                  </ThemedText>
                </Pressable>
              </View>
              {quickRoutines.map((r) => (
                <Pressable
                  key={r.id}
                  onPress={() => startRoutine(r.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Start ${r.name}`}>
                  {({ pressed }) => (
                    <ThemedView type="backgroundElement" style={[styles.routineRow, { opacity: pressed ? 0.75 : 1 }]}>
                      <View style={styles.flex}>
                        <ThemedText style={styles.routineName} numberOfLines={1}>
                          {r.name}
                        </ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {r.exercises.length} {r.exercises.length === 1 ? 'exercise' : 'exercises'}
                        </ThemedText>
                      </View>
                      <ThemedText type="smallBold" themeColor="accent">
                        Start ›
                      </ThemedText>
                    </ThemedView>
                  )}
                </Pressable>
              ))}
            </View>
          ) : (
            <PlaceholderCard
              eyebrow="Tip"
              title="Save your go-to workouts"
              body="Make routines like Push, Pull and Legs on the Routines tab, and they'll show up here to start in one tap."
            />
          )}
          <Pressable
            onPress={start}
            disabled={active === undefined || starting}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.startButton,
              { backgroundColor: theme.accent, opacity: pressed || starting ? 0.8 : 1 },
            ]}>
            <ThemedText style={[styles.startLabel, { color: theme.onAccent }]}>Start empty workout</ThemedText>
          </Pressable>
        </>
      )}

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

/** "Started 12:34 ago", ticking every second. */
function ElapsedText({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <ThemedText type="small" themeColor="textSecondary" style={styles.elapsed}>
      {formatDuration((now - startedAt) / 1000)} elapsed
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  routines: { gap: Spacing.two },
  routinesHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  routineRow: { borderRadius: 14, padding: Spacing.three, flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  routineName: { fontSize: 17, lineHeight: 22, fontWeight: 700 },
  activeCard: {
    borderRadius: 16,
    borderWidth: 1.5,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  eyebrow: { textTransform: 'uppercase', letterSpacing: 1, fontSize: 12 },
  activeTitle: { fontSize: 20, lineHeight: 26, fontWeight: 800 },
  elapsed: { fontVariant: ['tabular-nums'] },
  resume: { marginTop: Spacing.two, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
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
