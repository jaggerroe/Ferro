import { useEffect, useRef, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { Pressable, StyleSheet, Vibration, View } from 'react-native';

import { Chip } from '@/components/chip';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  adjustRestTarget,
  REST_PRESETS,
  setRestTarget,
  startRest,
  stopRest,
  useRest,
} from '@/lib/rest';
import { getSettings, saveSetting } from '@/lib/settings';
import { formatDuration } from '@/lib/workouts';

type RestBarProps = {
  /** Space for the home indicator, so the bar's content sits above it. */
  bottomInset?: number;
};

/**
 * The rest bar pinned to the bottom of the workout screen.
 * - Idle: your rest time (tap to change it) and a Start button.
 * - Running: counts up from 0:00 toward your rest time, buzzes when you
 *   reach it, and keeps counting so you can see how long you've gone over.
 */
export function RestBar({ bottomInset = 0 }: RestBarProps) {
  const theme = useTheme();
  const db = useSQLiteContext();
  const { startedAt, targetSec } = useRest();
  const [editing, setEditing] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const buzzedFor = useRef<number | null>(null);

  const running = startedAt !== null;

  // Changing the rest time here also saves it as your default (Profile → Default rest time).
  useEffect(() => {
    if (targetSec !== getSettings().restSec) {
      saveSetting(db, 'restSec', targetSec).catch((err) => console.warn('Could not save rest time', err));
    }
  }, [db, targetSec]);

  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [running, startedAt]);

  const elapsedSec = running ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;
  const reached = running && targetSec !== null && elapsedSec >= targetSec;

  // Buzz once per rest when you reach your rest time.
  useEffect(() => {
    if (reached && buzzedFor.current !== startedAt) {
      buzzedFor.current = startedAt;
      Vibration.vibrate([0, 400, 150, 400]);
    }
  }, [reached, startedAt]);

  const targetLabel = targetSec === null ? 'No limit' : formatDuration(targetSec);
  const progress = running && targetSec ? Math.min(1, elapsedSec / targetSec) : 0;

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: theme.backgroundElement,
          borderTopColor: theme.backgroundSelected,
          paddingBottom: Spacing.two + bottomInset,
        },
      ]}>
      {editing ? (
        <View style={styles.editor}>
          <View style={styles.editorHeader}>
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.caps}>
              Rest time
            </ThemedText>
            <Pressable onPress={() => setEditing(false)} accessibilityRole="button" hitSlop={8}>
              <ThemedText type="smallBold" themeColor="accent">
                Done
              </ThemedText>
            </Pressable>
          </View>

          <View style={styles.stepper}>
            <StepButton label="−15" onPress={() => adjustRestTarget(-15)} a11y="15 seconds less" />
            <ThemedText style={styles.stepValue}>{targetLabel}</ThemedText>
            <StepButton label="+15" onPress={() => adjustRestTarget(15)} a11y="15 seconds more" />
          </View>

          <View style={styles.presets}>
            {REST_PRESETS.map((sec) => (
              <Chip
                key={sec}
                label={formatDuration(sec)}
                selected={targetSec === sec}
                onPress={() => setRestTarget(sec)}
              />
            ))}
            <Chip label="No limit" selected={targetSec === null} onPress={() => setRestTarget(null)} />
          </View>
        </View>
      ) : null}

      {running && targetSec ? (
        <View style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
          <View style={[styles.fill, { backgroundColor: theme.accent, width: `${progress * 100}%` }]} />
        </View>
      ) : null}

      <View style={styles.row}>
        <Pressable
          onPress={() => setEditing((e) => !e)}
          accessibilityRole="button"
          accessibilityLabel={`Rest time ${targetLabel}. Tap to change.`}
          hitSlop={6}
          style={({ pressed }) => [styles.info, { opacity: pressed ? 0.7 : 1 }]}>
          <ThemedText type="small" themeColor={reached ? 'accent' : 'textSecondary'}>
            {running ? (reached ? 'Rest done' : 'Resting') : 'Rest time'}
          </ThemedText>
          {running ? (
            <ThemedText style={styles.time}>
              <ThemedText style={[styles.time, reached && { color: theme.accent }]}>
                {formatDuration(elapsedSec)}
              </ThemedText>
              {targetSec !== null ? (
                <ThemedText themeColor="textSecondary" style={styles.of}>
                  {'  /  '}
                  {targetLabel}
                </ThemedText>
              ) : null}
            </ThemedText>
          ) : (
            <ThemedText style={styles.time}>
              {targetLabel}
              <ThemedText themeColor="accent" style={styles.edit}>
                {'  '}
                {editing ? '' : 'Change'}
              </ThemedText>
            </ThemedText>
          )}
        </Pressable>

        <Pressable
          onPress={running ? stopRest : startRest}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.action,
            {
              backgroundColor: running ? theme.backgroundSelected : theme.accent,
              opacity: pressed ? 0.8 : 1,
            },
          ]}>
          <ThemedText type="smallBold" style={[styles.actionLabel, { color: running ? theme.text : theme.onAccent }]}>
            {running ? 'Stop' : 'Start rest'}
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

function StepButton({ label, onPress, a11y }: { label: string; onPress: () => void; a11y: string }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      style={({ pressed }) => [styles.step, { backgroundColor: theme.backgroundSelected, opacity: pressed ? 0.7 : 1 }]}>
      <ThemedText type="smallBold" style={styles.stepLabel}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    gap: Spacing.two,
  },
  editor: { gap: Spacing.three, paddingBottom: Spacing.two },
  editorHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  caps: { textTransform: 'uppercase', letterSpacing: 1, fontSize: 12 },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.four },
  step: { borderRadius: 12, paddingHorizontal: 18, paddingVertical: 10 },
  stepLabel: { fontSize: 16 },
  stepValue: { fontSize: 28, lineHeight: 34, fontWeight: 800, minWidth: 110, textAlign: 'center', fontVariant: ['tabular-nums'] },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, justifyContent: 'center' },
  track: { height: 4, borderRadius: 2, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  info: { flex: 1 },
  time: { fontSize: 22, lineHeight: 28, fontWeight: 800, fontVariant: ['tabular-nums'] },
  of: { fontSize: 16, fontWeight: 600 },
  edit: { fontSize: 14, fontWeight: 700 },
  action: { borderRadius: 12, paddingHorizontal: 18, paddingVertical: 12 },
  actionLabel: { fontSize: 16 },
});
