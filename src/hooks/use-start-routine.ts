import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Alert } from 'react-native';

import { startRoutine, WorkoutInProgressError } from '@/lib/routines';

/**
 * Returns a function that starts a routine and opens the workout screen.
 * If a workout is already in progress it offers to resume that instead,
 * so you never end up with two at once.
 */
export function useStartRoutine() {
  const db = useSQLiteContext();

  return async function start(routineId: string) {
    try {
      await startRoutine(db, routineId);
      router.push('/workout');
    } catch (err) {
      if (err instanceof WorkoutInProgressError) {
        Alert.alert('Workout in progress', 'Finish or discard your current workout before starting a routine.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Resume workout', onPress: () => router.push('/workout') },
        ]);
        return;
      }
      console.warn('Could not start routine', err);
      Alert.alert("Couldn't start routine", 'Something went wrong. Try again.');
    }
  };
}
