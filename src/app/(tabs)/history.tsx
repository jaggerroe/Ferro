import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, SectionList, StyleSheet, View } from 'react-native';

import { PlaceholderCard } from '@/components/placeholder-card';
import { ListGap, listContentStyle, Screen, ScreenFrame } from '@/components/screen';
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

  // Group into months: [{ title: 'October 2026', data: [...] }, ...] (the shape SectionList wants).
  const sections = useMemo(() => {
    const groups: { title: string; data: HistoryItem[] }[] = [];
    for (const item of history ?? []) {
      const month = monthLabel(item.started_at);
      const last = groups[groups.length - 1];
      if (last && last.title === month) last.data.push(item);
      else groups.push({ title: month, data: [item] });
    }
    return groups;
  }, [history]);

  if (history === undefined) return <Screen title="History" />;

  // A SectionList only draws the cards near the screen (plus a few ahead), so
  // opening History stays quick even with hundreds of workouts.
  return (
    <ScreenFrame title="History">
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <HistoryCard item={item} nameOf={nameOf} />}
        renderSectionHeader={({ section }) => (
          <ThemedText type="smallBold" themeColor="accent" style={styles.monthTitle}>
            {section.title}
          </ThemedText>
        )}
        // Month headings scroll with the list, like before.
        stickySectionHeadersEnabled={false}
        ItemSeparatorComponent={SmallGap}
        ListHeaderComponent={
          history.length === 0 ? (
            <PlaceholderCard
              title="No workouts yet"
              body="Finish a workout from the Workout tab and it shows up here, newest first."
            />
          ) : (
            <ThemedText type="small" themeColor="textSecondary">
              {history.length} {history.length === 1 ? 'workout' : 'workouts'} logged
            </ThemedText>
          )
        }
        contentContainerStyle={listContentStyle}
        initialNumToRender={8}
      />
    </ScreenFrame>
  );
}

/** 8 px between cards in the same month. */
function SmallGap() {
  return <ListGap size={Spacing.two} />;
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
  monthTitle: {
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontSize: 12,
    marginTop: Spacing.four,
    marginBottom: Spacing.two,
  },
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
