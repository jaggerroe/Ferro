import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { Chip } from '@/components/chip';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useHistory } from '@/lib/history';
import { REST_PRESETS, setRestTarget } from '@/lib/rest';
import { useRoutines } from '@/lib/routines';
import { saveSetting, useSettings, type Settings } from '@/lib/settings';
import { formatDuration } from '@/lib/workouts';

const ACCOUNT_ROWS = ['Edit profile', 'Sign out', 'Delete account'];

export default function ProfileScreen() {
  const theme = useTheme();
  const db = useSQLiteContext();
  const settings = useSettings();
  const history = useHistory();
  const routines = useRoutines();

  function set<K extends keyof Settings>(key: K, value: Settings[K]) {
    saveSetting(db, key, value).catch((err) => console.warn('Could not save setting', err));
  }

  function setRest(sec: number | null) {
    set('restSec', sec);
    setRestTarget(sec); // the rest bar picks it up right away
  }

  const workoutCount = history?.length ?? 0;
  const routineCount = routines?.length ?? 0;

  return (
    <SafeAreaView edges={['top', 'bottom']} style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <View style={styles.topBar}>
        <ThemedText style={styles.heading}>Profile</ThemedText>
        <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={8}>
          <ThemedText type="smallBold" themeColor="accent" style={styles.done}>
            Done
          </ThemedText>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.identity}>
          <Avatar size={80} />
          <ThemedText style={styles.name}>Jagger</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {workoutCount} {workoutCount === 1 ? 'workout' : 'workouts'} · {routineCount}{' '}
            {routineCount === 1 ? 'routine' : 'routines'}
          </ThemedText>
        </View>

        <Section title="Preferences">
          <SettingRow label="Units" hint="Your saved workouts convert automatically.">
            <Chip label="lb" selected={settings.weightUnit === 'lb'} onPress={() => set('weightUnit', 'lb')} />
            <Chip label="kg" selected={settings.weightUnit === 'kg'} onPress={() => set('weightUnit', 'kg')} />
          </SettingRow>

          <SettingRow label="Default rest time" hint="Where the rest timer starts. Changing it in a workout updates this too.">
            {REST_PRESETS.map((sec) => (
              <Chip key={sec} label={formatDuration(sec)} selected={settings.restSec === sec} onPress={() => setRest(sec)} />
            ))}
            <Chip label="No limit" selected={settings.restSec === null} onPress={() => setRest(null)} />
            {settings.restSec !== null && !REST_PRESETS.includes(settings.restSec) ? (
              <Chip label={formatDuration(settings.restSec)} selected />
            ) : null}
          </SettingRow>

          <SettingRow label="Theme">
            <Chip label="System" selected={settings.theme === 'system'} onPress={() => set('theme', 'system')} />
            <Chip label="Light" selected={settings.theme === 'light'} onPress={() => set('theme', 'light')} />
            <Chip label="Dark" selected={settings.theme === 'dark'} onPress={() => set('theme', 'dark')} />
          </SettingRow>
        </Section>

        <Section title="Account">
          {ACCOUNT_ROWS.map((row) => (
            <View key={row} style={styles.plainRow}>
              <ThemedText>{row}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Soon
              </ThemedText>
            </View>
          ))}
        </Section>

        <ThemedText type="small" themeColor="textSecondary" style={styles.footnote}>
          Your workouts are saved on this phone. Accounts and backup come with the backend.
        </ThemedText>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const theme = useTheme();
  const rows = Array.isArray(children) ? children.flat() : [children];
  return (
    <View style={styles.section}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionTitle}>
        {title}
      </ThemedText>
      <ThemedView type="backgroundElement" style={styles.group}>
        {rows.map((child, i) => (
          <View key={i} style={i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.backgroundSelected }}>
            {child}
          </View>
        ))}
      </ThemedView>
    </View>
  );
}

function SettingRow({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <View style={styles.settingRow}>
      <ThemedText style={styles.settingLabel}>{label}</ThemedText>
      <View style={styles.chips}>{children}</View>
      {hint ? (
        <ThemedText type="small" themeColor="textSecondary">
          {hint}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  heading: { fontSize: 20, lineHeight: 26, fontWeight: 800 },
  done: { fontSize: 16 },
  body: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.five, gap: Spacing.four },
  identity: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.three },
  name: { fontSize: 24, lineHeight: 30, fontWeight: 800 },
  section: { gap: Spacing.two },
  sectionTitle: { textTransform: 'uppercase', letterSpacing: 1, fontSize: 12, paddingHorizontal: Spacing.two },
  group: { borderRadius: 14, overflow: 'hidden' },
  settingRow: { paddingHorizontal: Spacing.three, paddingVertical: 14, gap: Spacing.two },
  settingLabel: { fontWeight: 700 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  plainRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: 14,
  },
  footnote: { textAlign: 'center', paddingHorizontal: Spacing.three },
});
