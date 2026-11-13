import * as Notifications from 'expo-notifications';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Alert, Linking, Platform } from 'react-native';

import { buildSlots, getCompounds, getDosesBetween, startOfDay, startOfNextDay, TIMES, type Compound, type Dose } from '@/lib/meds';
import { getSettings, saveSetting } from '@/lib/settings';

/**
 * Meds reminders: local notifications at your times (morning, evening, ...).
 *
 * - One notification per time of day, e.g. "Time for your evening meds",
 *   not one per pill.
 * - Never shows what you take. The lock screen just says how many things,
 *   so nobody glancing at your phone sees the names.
 * - Skipped if you've already logged everything for that time.
 * - Scheduled on the phone (no server). The app plans the next 14 days
 *   every time something changes or you open it. If you don't open Ferro
 *   for two weeks, reminders stop until you do.
 */

const ID_PREFIX = 'med-';
const CHANNEL = 'med-reminders';
const DAYS_AHEAD = 14;
/** iPhones keep at most 64 scheduled notifications per app. Stay under it. */
const MAX_SCHEDULED = 60;

// While the app is open, still show the reminder as a banner.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export type PlannedReminder = {
  id: string;
  at: number;
  title: string;
  body: string;
};

/**
 * Works out which reminders should exist (plain function, no notifications
 * involved, so it's easy to test).
 *
 * For each of the next `days` days, every time with something still to take
 * gets one reminder. Today uses your logged doses, so a time you've already
 * finished is skipped. Times that have already passed are skipped too.
 */
export function planReminders(compounds: Compound[], todaysDoses: Dose[], now: number, days = DAYS_AHEAD) {
  const plan: PlannedReminder[] = [];
  const today = startOfDay(now);
  let day = today;
  for (let d = 0; d < days; d++) {
    const slots = buildSlots(compounds, day === today ? todaysDoses : [], day);
    const open = new Map<string, number>(); // "HH:MM" → how many still to take
    for (const s of slots) if (!s.dose) open.set(s.time, (open.get(s.time) ?? 0) + 1);

    for (const [time, count] of open) {
      const [h, m] = time.split(':').map(Number);
      const at = new Date(day);
      at.setHours(h, m, 0, 0);
      if (at.getTime() <= now + 30_000) continue; // already passed (or about to)
      const label = (TIMES.find((t) => t.value === time)?.label ?? 'Meds').toLowerCase();
      plan.push({
        id: `${ID_PREFIX}${dateKey(at)}-${time.replace(':', '')}`,
        at: at.getTime(),
        title: label === 'meds' ? 'Time for your meds' : `Time for your ${label} meds`,
        body: count === 1 ? '1 thing to take. Tap to log it.' : `${count} things to take. Tap to log them.`,
      });
    }
    day = startOfNextDay(day);
  }
  return plan.sort((a, b) => a.at - b.at).slice(0, MAX_SCHEDULED);
}

function dateKey(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

/** What makes a scheduled reminder "the same": if any of this changes, it's replaced. */
function fingerprint(r: PlannedReminder) {
  return `${r.at}|${r.title}|${r.body}`;
}

let queue: Promise<void> = Promise.resolve();

/**
 * Makes the phone's scheduled reminders match the plan. Only changes what's
 * different, and runs one at a time so quick changes don't trip over each other.
 * Turning reminders off (or the Meds tab off) cancels them all.
 */
export function updateMedReminders(db: SQLiteDatabase) {
  queue = queue.then(() => update(db)).catch((err) => console.warn('Could not update meds reminders', err));
  return queue;
}

async function update(db: SQLiteDatabase) {
  if (Platform.OS === 'web') return;
  const { showMedsTab, medReminders } = getSettings();
  const scheduled = (await Notifications.getAllScheduledNotificationsAsync()).filter((n) =>
    n.identifier.startsWith(ID_PREFIX),
  );

  let plan: PlannedReminder[] = [];
  if (showMedsTab && medReminders && (await Notifications.getPermissionsAsync()).granted) {
    const now = Date.now();
    const compounds = await getCompounds(db);
    const doses = await getDosesBetween(db, startOfDay(now), startOfNextDay(now));
    plan = planReminders(compounds, doses, now);
  }

  const wanted = new Map(plan.map((r) => [r.id, r]));
  for (const n of scheduled) {
    const r = wanted.get(n.identifier);
    if (r && n.content.data?.fingerprint === fingerprint(r)) {
      wanted.delete(n.identifier); // already scheduled exactly like this
    } else {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }
  if (wanted.size === 0) return;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'Meds reminders',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  for (const r of wanted.values()) {
    await Notifications.scheduleNotificationAsync({
      identifier: r.id,
      content: { title: r.title, body: r.body, sound: 'default', data: { kind: 'med-reminder', fingerprint: fingerprint(r) } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: r.at, channelId: CHANNEL },
    });
  }
}

/** True if a tapped notification was one of these reminders. */
export function isMedReminder(response: Notifications.NotificationResponse | null) {
  return response?.notification.request.content.data?.kind === 'med-reminder';
}

/**
 * Turns reminders on: asks for permission first. If you said no before,
 * the phone won't ask again, so we offer to open Settings instead.
 * Returns whether reminders are now on.
 */
export async function turnOnMedReminders(db: SQLiteDatabase) {
  let perm = await Notifications.getPermissionsAsync();
  if (!perm.granted && perm.canAskAgain) perm = await Notifications.requestPermissionsAsync();
  if (!perm.granted) {
    Alert.alert('Notifications are off for Ferro', 'To get reminders, allow notifications for Ferro in your phone’s Settings.', [
      { text: 'Not now', style: 'cancel' },
      { text: 'Open Settings', onPress: () => Linking.openSettings() },
    ]);
    return false;
  }
  await saveSetting(db, 'medReminders', true);
  await updateMedReminders(db);
  return true;
}

export async function turnOffMedReminders(db: SQLiteDatabase) {
  await saveSetting(db, 'medReminders', false);
  await updateMedReminders(db);
}
