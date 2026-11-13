import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { isMedReminder, updateMedReminders } from '@/lib/med-reminders';
import { useMedsVersion } from '@/lib/meds';
import { useSettings } from '@/lib/settings';

/**
 * Keeps meds reminders up to date. Renders nothing.
 *
 * Re-plans when your meds or doses change (so logging a dose cancels that
 * time's reminder), when the setting changes, and whenever the app comes
 * back to the front (a new day, or you changed notification permission in
 * Settings). Tapping a reminder opens the Meds tab.
 */
export function MedRemindersManager() {
  const db = useSQLiteContext();
  const medsVersion = useMedsVersion();
  const { showMedsTab, medReminders } = useSettings();

  useEffect(() => {
    updateMedReminders(db);
  }, [db, medsVersion, showMedsTab, medReminders]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') updateMedReminders(db);
    });
    return () => sub.remove();
  }, [db]);

  useEffect(() => {
    // Opened the app by tapping a reminder while it was closed.
    if (isMedReminder(Notifications.getLastNotificationResponse())) {
      Notifications.clearLastNotificationResponse();
      router.navigate('/meds');
    }
    // Tapped a reminder while the app was open or in the background.
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      if (isMedReminder(response)) router.navigate('/meds');
    });
    return () => sub.remove();
  }, []);

  return null;
}
