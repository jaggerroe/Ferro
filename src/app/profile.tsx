import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { type ReactNode } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { Chip } from '@/components/chip';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { deleteAccount, signOut, useSession, useUsername } from '@/lib/auth';
import { useHistory } from '@/lib/history';
import { REST_PRESETS, setRestTarget } from '@/lib/rest';
import { useRoutines } from '@/lib/routines';
import { saveSetting, useSettings, type Settings } from '@/lib/settings';
import { isBackendConfigured } from '@/lib/supabase';
import { resetSyncAccount, syncNow, useSyncStatus } from '@/lib/sync';
import { formatDuration } from '@/lib/workouts';

export default function ProfileScreen() {
  const theme = useTheme();
  const db = useSQLiteContext();
  const settings = useSettings();
  const history = useHistory();
  const routines = useRoutines();
  const session = useSession();
  const userId = session?.user.id;
  const username = useUsername(userId);
  const sync = useSyncStatus();

  function confirmSignOut() {
    Alert.alert('Sign out?', 'Your workouts stay on this phone. Sign back in anytime to keep backing up.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => signOut() },
    ]);
  }

  function confirmDeleteAccount() {
    Alert.alert(
      'Delete your account?',
      'This deletes your account and your cloud backup for good. Workouts on this phone stay here.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete account',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAccount();
              await resetSyncAccount(db);
            } catch (err) {
              Alert.alert("Couldn't delete account", err instanceof Error ? err.message : 'Try again.');
            }
          },
        },
      ],
    );
  }

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
          <ThemedText style={styles.name}>{username ? `@${username}` : 'Your profile'}</ThemedText>
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

        {session ? (
          <Section title="Account">
            <View style={styles.plainRow}>
              <ThemedText>Email</ThemedText>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.rowValue}>
                {session.user.email}
              </ThemedText>
            </View>

            {sync.state === 'other-account' ? (
              <View style={styles.settingRow}>
                <ThemedText style={styles.settingLabel}>This phone has another account’s workouts</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  It last backed up to a different account. Add those workouts to this account, or sign out.
                </ThemedText>
                <View style={styles.chips}>
                  <Chip label="Add them to this account" selected onPress={() => userId && syncNow(db, userId, true)} />
                  <Chip label="Sign out" onPress={() => signOut()} />
                </View>
              </View>
            ) : (
              <View style={styles.plainRow}>
                <View style={styles.flex}>
                  <ThemedText>Backup</ThemedText>
                  <ThemedText
                    type="small"
                    themeColor={sync.state === 'error' ? 'danger' : 'textSecondary'}
                    numberOfLines={2}>
                    {sync.state === 'syncing'
                      ? 'Backing up…'
                      : sync.state === 'error'
                        ? sync.error
                        : sync.lastSyncedAt
                          ? `Backed up ${timeAgo(sync.lastSyncedAt)}`
                          : 'Not backed up yet'}
                  </ThemedText>
                </View>
                {sync.state === 'syncing' ? (
                  <ActivityIndicator color={theme.accent} />
                ) : (
                  <Pressable onPress={() => userId && syncNow(db, userId)} accessibilityRole="button" hitSlop={8}>
                    <ThemedText type="smallBold" themeColor="accent">
                      Back up now
                    </ThemedText>
                  </Pressable>
                )}
              </View>
            )}

            <Pressable onPress={confirmSignOut} accessibilityRole="button" style={styles.plainRow}>
              <ThemedText>Sign out</ThemedText>
            </Pressable>
            <Pressable onPress={confirmDeleteAccount} accessibilityRole="button" style={styles.plainRow}>
              <ThemedText themeColor="danger">Delete account</ThemedText>
            </Pressable>
          </Section>
        ) : (
          <Section title="Account">
            <View style={styles.settingRow}>
              <ThemedText style={styles.settingLabel}>Back up your workouts</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {isBackendConfigured
                  ? 'Make a free account to back up your workouts, routines and settings, and get them back on a new phone.'
                  : 'Accounts aren’t set up yet. Add your Supabase keys to .env.local.'}
              </ThemedText>
              {isBackendConfigured && session === null ? (
                <Pressable
                  onPress={() => router.push('/account')}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.accountButton, { backgroundColor: theme.accent, opacity: pressed ? 0.8 : 1 }]}>
                  <ThemedText type="smallBold" style={{ color: theme.onAccent }}>
                    Sign in or create account
                  </ThemedText>
                </Pressable>
              ) : null}
            </View>
          </Section>
        )}

        <ThemedText type="small" themeColor="textSecondary" style={styles.footnote}>
          {session
            ? 'Your workouts live on this phone and back up automatically while you’re signed in.'
            : 'Your workouts are saved on this phone.'}
        </ThemedText>
      </ScrollView>
    </SafeAreaView>
  );
}

/** "just now", "5 min ago", "3 hr ago", or a date. */
function timeAgo(ms: number) {
  const min = Math.round((Date.now() - ms) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  if (min < 24 * 60) return `${Math.round(min / 60)} hr ago`;
  return `on ${new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
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
  flex: { flex: 1 },
  rowValue: { flexShrink: 1, marginLeft: Spacing.three },
  accountButton: { borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: Spacing.one },
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
