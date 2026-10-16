import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { PlaceholderCard } from '@/components/placeholder-card';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAllExercises } from '@/lib/custom-exercises';
import {
  dayLabel,
  monthLabel,
  shortDuration,
  timeLabel,
  useHistory,
  volumeLabel,
  type HistoryItem,
} from '@/lib/history';
import { useSettings } from '@/lib/settings';
import { useTheme } from '@/hooks/use-theme';

/** How many exercises a card lists before "+ N more". */
const MAX_EXERCISES_SHOWN = 4;

export default function HistoryScreen() {
  const history = useHistory();
  useSettings(); // re-draw if you switch lb/kg
  const exercises = useAllExercises();
  const nameOf = useMemo(() => {
    const map = new Map(exercises.map((e) => [e.id, e.name]));
    return (id: string) => map.get(id) ?? 'Unknown exercise';
  }, [exercises]);

  // Group into months: [{ month: 'October 2026', items: [...] }, ...]
  const months = useMemo(() => {
    const groups: { month: string; items: HistoryItem[] }[] = [];
    for (const item of history ?? []) {
      const month = monthLabel(item.started_at);
      const last = groups[groups.length - 1];
      if (last && last.month === month) last.items.push(item);
      else groups.push({ month, items: [item] });
    }
    return groups;
  }, [history]);

  if (history === undefined) return <Screen title="History" />;

  return (
    <Screen title="History">
      {history.length === 0 ? (
        <PlaceholderCard
          title="No workouts yet"
          body="Finish a workout from the Workout tab and it shows up here, newest first."
        />
      ) : (
        <ThemedText type="small" themeColor="textSecondary">
          {history.length} {history.length === 1 ? 'workout' : 'workouts'} logged
        </ThemedText>
      )}

      {months.map((group) => (
        <View key={group.month} style={styles.month}>
          <ThemedText type="smallBold" themeColor="accent" style={styles.monthTitle}>
            {group.month}
          </ThemedText>
          {group.items.map((item) => (
            <HistoryCard key={item.id} item={item} nameOf={nameOf} />
          ))}
        </View>
      ))}
    </Screen>
  );
}

function HistoryCard({ item, nameOf }: { item: HistoryItem; nameOf: (id: string) => string }) {
  const theme = useTheme();
  const durationSec = (item.finished_at - item.started_at) / 1000;
  const meta = [
    timeLabel(item.started_at),
    shortDuration(durationSec),
    `${item.setCount} ${item.setCount === 1 ? 'set' : 'sets'}`,
    volumeLabel(item.volume),
  ].filter(Boolean);
  const shown = item.exercises.slice(0, MAX_EXERCISES_SHOWN);
  const hidden = item.exercises.length - shown.length;

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/workouts/[id]', params: { id: item.id } })}
      accessibilityRole="button"
      accessibilityLabel={`${item.name || 'Workout'}, ${dayLabel(item.started_at)}`}>
      {({ pressed }) => (
        <ThemedView type="backgroundElement" style={[styles.card, { opacity: pressed ? 0.75 : 1 }]}>
          <View style={styles.cardTop}>
            <ThemedText style={styles.cardTitle} numberOfLines={1}>
              {item.name || 'Workout'}
            </ThemedText>
            <ThemedText type="smallBold" themeColor="textSecondary">
              {dayLabel(item.started_at)}
            </ThemedText>
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            {meta.join('  ·  ')}
          </ThemedText>

          <View style={[styles.exerciseList, { borderTopColor: theme.backgroundSelected }]}>
            {shown.map((e, i) => (
              <ThemedText key={`${e.exercise_id}-${i}`} type="small" numberOfLines={1}>
                <ThemedText type="smallBold" themeColor="textSecondary">
                  {e.sets} ×{' '}
                </ThemedText>
                {nameOf(e.exercise_id)}
              </ThemedText>
            ))}
            {hidden > 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                + {hidden} more
              </ThemedText>
            ) : null}
          </View>
        </ThemedView>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  month: { gap: Spacing.two },
  monthTitle: { textTransform: 'uppercase', letterSpacing: 1, fontSize: 12, marginTop: Spacing.two },
  card: { borderRadius: 16, padding: Spacing.three, gap: 2 },
  cardTop: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: Spacing.two },
  cardTitle: { flex: 1, fontSize: 17, lineHeight: 22, fontWeight: 700 },
  exerciseList: {
    marginTop: Spacing.two,
    paddingTop: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 2,
  },
});
