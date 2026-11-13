import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { Chip } from '@/components/chip';
import { PlaceholderCard } from '@/components/placeholder-card';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { turnOnMedReminders } from '@/lib/med-reminders';
import {
  deleteDose,
  describeSchedule,
  formatAmount,
  formatClock,
  formatTime,
  KINDS,
  logDose,
  partOfDay,
  useMedsToday,
  type Compound,
  type Slot,
} from '@/lib/meds';
import { saveSetting, useSettings } from '@/lib/settings';

/**
 * The Meds tab (only shown when it's turned on in Profile).
 * "Today" is what's due today and what you've taken; "All" lists everything
 * you've set up. Tapping something opens it to log a dose or edit it.
 */
export default function MedsScreen() {
  const data = useMedsToday();
  const [view, setView] = useState<'today' | 'all'>('today');

  if (data === undefined) return <Screen title="Meds" />;

  if (data.compounds.length === 0) {
    return (
      <Screen title="Meds">
        <PlaceholderCard
          eyebrow="Meds & supplements"
          title="Track what you take"
          body="Add anything you take, like a prescription, a supplement or an injection. Set when you take it, then tick it off each day. Only you can see this; it's never shared with friends."
        />
        <AddButton label="Add your first one" />
      </Screen>
    );
  }

  return (
    <Screen title="Meds">
      <View style={styles.chips}>
        <Chip label="Today" selected={view === 'today'} onPress={() => setView('today')} />
        <Chip label="All" selected={view === 'all'} onPress={() => setView('all')} />
      </View>

      {view === 'today' ? <TodayView slots={data.slots} asNeeded={data.asNeeded} /> : <AllView compounds={data.compounds} />}

      <ThemedText type="small" themeColor="textSecondary" style={styles.footnote}>
        Only you can see this. It backs up to your account but is never shared with friends.
      </ThemedText>
    </Screen>
  );
}

function TodayView({ slots, asNeeded }: { slots: Slot[]; asNeeded: { compound: Compound; lastTakenAt: number | null }[] }) {
  const done = slots.filter((s) => s.dose).length;
  const next = slots.find((s) => !s.dose);

  // Group into Morning / Afternoon / Evening, keeping time order.
  const groups: { title: string; slots: Slot[] }[] = [];
  for (const slot of slots) {
    const title = partOfDay(slot.time);
    const last = groups[groups.length - 1];
    if (last?.title === title) last.slots.push(slot);
    else groups.push({ title, slots: [slot] });
  }

  return (
    <>
      {slots.length > 0 ? (
        <ProgressCard done={done} total={slots.length} next={next} />
      ) : (
        <PlaceholderCard title="Nothing scheduled today" body="Things you take as needed are below. Tap one to log it." />
      )}

      {slots.length > 0 ? <RemindersCard /> : null}

      {groups.map((g) => (
        <View key={g.title} style={styles.group}>
          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.eyebrow}>
            {g.title}
          </ThemedText>
          {g.slots.map((slot) => (
            <SlotRow key={slot.key} slot={slot} />
          ))}
        </View>
      ))}

      {asNeeded.length > 0 ? (
        <View style={styles.group}>
          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.eyebrow}>
            As needed
          </ThemedText>
          {asNeeded.map(({ compound, lastTakenAt }) => (
            <AsNeededRow key={compound.id} compound={compound} lastTakenAt={lastTakenAt} />
          ))}
        </View>
      ) : null}
    </>
  );
}

function ProgressCard({ done, total, next }: { done: number; total: number; next: Slot | undefined }) {
  const theme = useTheme();
  const allDone = done === total;
  return (
    <ThemedView type="backgroundElement" style={styles.progressCard}>
      <View style={[styles.progressTrack, { backgroundColor: theme.backgroundSelected }]}>
        <View style={[styles.progressFill, { backgroundColor: theme.accent, width: `${(done / total) * 100}%` }]} />
      </View>
      <ThemedText style={styles.progressTitle}>
        {allDone ? 'All done for today' : `${done} of ${total} done`}
      </ThemedText>
      {next ? (
        <ThemedText type="small" themeColor="textSecondary">
          Next: {next.compound.name} · {formatClock(next.time)}
        </ThemedText>
      ) : null}
    </ThemedView>
  );
}

/** Offers to turn on reminders, until you do or tap "Not now". (Also in Profile.) */
function RemindersCard() {
  const theme = useTheme();
  const db = useSQLiteContext();
  const { medReminders, medRemindersCardHidden } = useSettings();
  if (medReminders || medRemindersCardHidden) return null;
  return (
    <ThemedView type="backgroundElement" style={styles.progressCard}>
      <ThemedText style={styles.rowTitle}>Want reminders?</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Get a notification at your times, unless you&apos;ve already logged it. It never shows what you take.
      </ThemedText>
      <View style={styles.cardButtons}>
        <Pressable
          onPress={() => turnOnMedReminders(db)}
          accessibilityRole="button"
          style={({ pressed }) => [styles.logPill, { backgroundColor: theme.accent, opacity: pressed ? 0.8 : 1 }]}>
          <ThemedText type="smallBold" style={{ color: theme.onAccent }}>
            Turn on
          </ThemedText>
        </Pressable>
        <Pressable
          onPress={() => saveSetting(db, 'medRemindersCardHidden', true)}
          accessibilityRole="button"
          hitSlop={8}
          style={styles.logPill}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            Not now
          </ThemedText>
        </Pressable>
      </View>
    </ThemedView>
  );
}

/** One expected dose. The circle ticks it off; the rest of the row opens it. */
function SlotRow({ slot }: { slot: Slot }) {
  const theme = useTheme();
  const db = useSQLiteContext();
  const { compound, dose } = slot;
  const [busy, setBusy] = useState(false);

  function open() {
    router.push({
      pathname: '/log-dose',
      params: dose ? { compoundId: compound.id, doseId: dose.id } : { compoundId: compound.id },
    });
  }

  async function toggle() {
    if (busy) return;
    if (dose) {
      Alert.alert(`Undo ${compound.name}?`, `This removes the dose you logged at ${formatTime(dose.taken_at)}.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Undo', style: 'destructive', onPress: () => deleteDose(db, dose.id).catch(warn) },
      ]);
      return;
    }
    // Injections open the full screen so you can pick the site.
    if (compound.form === 'injection') {
      open();
      return;
    }
    setBusy(true);
    try {
      await logDose(db, compound.id, {
        amount: compound.default_amount,
        unit: compound.unit,
        taken_at: Date.now(),
        site: null,
        notes: null,
      });
    } catch (err) {
      warn(err);
    } finally {
      setBusy(false);
    }
  }

  const amount = formatAmount(dose ? dose.amount : compound.default_amount, dose ? dose.unit : compound.unit);
  const detail = dose
    ? [amount, dose.site].filter(Boolean).join(' · ')
    : [amount, compound.form === 'injection' ? 'tap to pick site' : ''].filter(Boolean).join(' · ');

  return (
    <Pressable onPress={open} accessibilityRole="button" accessibilityLabel={`${compound.name}, ${dose ? 'taken' : 'not taken yet'}`}>
      {({ pressed }) => (
        <ThemedView type="backgroundElement" style={[styles.row, { opacity: pressed ? 0.8 : 1 }]}>
          <Pressable
            onPress={toggle}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: !!dose }}
            accessibilityLabel={dose ? `Undo ${compound.name}` : `Mark ${compound.name} as taken`}
            hitSlop={10}
            style={[
              styles.check,
              dose
                ? { backgroundColor: theme.accent, borderColor: theme.accent }
                : { borderColor: theme.textSecondary },
            ]}>
            {dose ? <ThemedText style={[styles.checkMark, { color: theme.onAccent }]}>✓</ThemedText> : null}
          </Pressable>
          <View style={styles.flex}>
            <ThemedText style={styles.rowTitle} numberOfLines={1}>
              {compound.name}
            </ThemedText>
            {detail ? (
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                {detail}
              </ThemedText>
            ) : null}
          </View>
          <ThemedText type="small" themeColor={dose ? 'accent' : 'textSecondary'}>
            {dose ? formatTime(dose.taken_at) : formatClock(slot.time)}
          </ThemedText>
        </ThemedView>
      )}
    </Pressable>
  );
}

function AsNeededRow({ compound, lastTakenAt }: { compound: Compound; lastTakenAt: number | null }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/log-dose', params: { compoundId: compound.id } })}
      accessibilityRole="button"
      accessibilityLabel={`Log ${compound.name}`}>
      {({ pressed }) => (
        <ThemedView type="backgroundElement" style={[styles.row, { opacity: pressed ? 0.8 : 1 }]}>
          <View style={styles.flex}>
            <ThemedText style={styles.rowTitle} numberOfLines={1}>
              {compound.name}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {lastTakenAt ? `Last taken ${lastTakenLabel(lastTakenAt)}` : 'Not taken yet'}
            </ThemedText>
          </View>
          <View style={[styles.logPill, { backgroundColor: theme.backgroundSelected }]}>
            <ThemedText type="smallBold" themeColor="accent">
              Log
            </ThemedText>
          </View>
        </ThemedView>
      )}
    </Pressable>
  );
}

function AllView({ compounds }: { compounds: Compound[] }) {
  const active = compounds.filter((c) => c.ended_at === null);
  const finished = compounds.filter((c) => c.ended_at !== null);
  return (
    <>
      {active.map((c) => (
        <CompoundRow key={c.id} compound={c} />
      ))}
      <AddButton label="+ Add" />
      {finished.length > 0 ? (
        <View style={styles.group}>
          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.eyebrow}>
            Finished
          </ThemedText>
          {finished.map((c) => (
            <CompoundRow key={c.id} compound={c} />
          ))}
        </View>
      ) : null}
    </>
  );
}

function CompoundRow({ compound }: { compound: Compound }) {
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/compound', params: { id: compound.id } })}
      accessibilityRole="button"
      accessibilityLabel={`Edit ${compound.name}`}>
      {({ pressed }) => (
        <ThemedView type="backgroundElement" style={[styles.row, { opacity: pressed ? 0.8 : 1 }]}>
          <View style={styles.flex}>
            <ThemedText style={styles.rowTitle} numberOfLines={1}>
              {compound.name}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {KINDS[compound.kind] ?? 'Other'} · {describeSchedule(compound)}
            </ThemedText>
          </View>
          <ThemedText type="smallBold" themeColor="textSecondary">
            ›
          </ThemedText>
        </ThemedView>
      )}
    </Pressable>
  );
}

function AddButton({ label }: { label: string }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={() => router.push('/compound')}
      accessibilityRole="button"
      accessibilityLabel="Add a med or supplement"
      style={({ pressed }) => [styles.addButton, { backgroundColor: theme.accent, opacity: pressed ? 0.8 : 1 }]}>
      <ThemedText style={[styles.addLabel, { color: theme.onAccent }]}>{label}</ThemedText>
    </Pressable>
  );
}

/** "today at 8:04 am", "yesterday", or a date. */
function lastTakenLabel(ms: number) {
  const days = Math.round((startOf(Date.now()) - startOf(ms)) / 86_400_000);
  if (days === 0) return `today at ${formatTime(ms)}`;
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return `on ${new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}
function startOf(ms: number) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function warn(err: unknown) {
  console.warn('Could not save dose', err);
  Alert.alert("Couldn't save", 'Something went wrong. Try again.');
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  chips: { flexDirection: 'row', gap: Spacing.two },
  group: { gap: Spacing.two },
  eyebrow: { textTransform: 'uppercase', letterSpacing: 1, fontSize: 12, paddingHorizontal: Spacing.one },
  progressCard: { borderRadius: 16, padding: Spacing.three, gap: Spacing.one },
  progressTrack: { height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: Spacing.two },
  progressFill: { height: 8, borderRadius: 4 },
  progressTitle: { fontSize: 18, lineHeight: 24, fontWeight: 800 },
  row: { borderRadius: 14, paddingHorizontal: Spacing.three, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  rowTitle: { fontSize: 17, lineHeight: 22, fontWeight: 700 },
  check: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  checkMark: { fontSize: 15, lineHeight: 18, fontWeight: 800 },
  logPill: { borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 },
  cardButtons: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.two },
  addButton: { borderRadius: 14, paddingVertical: Spacing.three, alignItems: 'center' },
  addLabel: { fontSize: 17, fontWeight: 800 },
  footnote: { textAlign: 'center', paddingHorizontal: Spacing.three, marginTop: Spacing.two },
});
