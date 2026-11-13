import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Chip } from '@/components/chip';
import { FormButton, FormField, formStyles, ModalTopBar } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  deleteDose,
  formatAmount,
  formatTime,
  getCompound,
  getDose,
  getRecentDoses,
  logDose,
  nextSite,
  parseAmount,
  SITES,
  updateDose,
  useMedsVersion,
  type Compound,
  type Dose,
} from '@/lib/meds';

/** "When" choices, in minutes before now. */
const AGO = [
  { label: 'Now', min: 0 },
  { label: '30 min ago', min: 30 },
  { label: '1 hr ago', min: 60 },
  { label: '3 hr ago', min: 180 },
];

/**
 * Log a dose (`/log-dose?compoundId=...`), or edit one you already logged
 * (`&doseId=...`). Below the form: your recent doses, tap one to edit it.
 */
export default function LogDoseScreen() {
  const theme = useTheme();
  const db = useSQLiteContext();
  const { compoundId, doseId } = useLocalSearchParams<{ compoundId: string; doseId?: string }>();
  const changes = useMedsVersion();

  const [compound, setCompound] = useState<Compound | null | undefined>(undefined);
  const [recent, setRecent] = useState<Dose[]>([]);
  const [editing, setEditing] = useState<Dose | null>(null);
  // Which dose the form was last filled from ('new' = a new dose). The form
  // is only re-filled when this changes, so a background reload doesn't wipe what you typed.
  const [target, setTarget] = useState<{ key: string; dose: Dose | null } | undefined>(undefined);

  const [amountText, setAmountText] = useState('');
  // null = keep the edited dose's time; a number = that many minutes before now.
  const [agoMin, setAgoMin] = useState<number | null>(0);
  const [site, setSite] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Load the compound, its recent doses and the dose being edited (again after any change).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const c = await getCompound(db, compoundId);
      const doses = c ? await getRecentDoses(db, c.id, 10) : [];
      const dose = doseId ? await getDose(db, doseId) : null;
      if (cancelled) return;
      setCompound(c);
      setRecent(doses);
      const key = doseId ?? 'new';
      setTarget((prev) => (prev?.key === key ? prev : { key, dose }));
    })().catch((err) => console.warn('Could not load', err));
    return () => {
      cancelled = true;
    };
  }, [db, compoundId, doseId, changes]);

  // Fill the form: from the dose being edited, or with your usual amount and the next site.
  useEffect(() => {
    if (!target || !compound) return;
    const dose = target.dose;
    setEditing(dose);
    if (dose) {
      setAmountText(dose.amount === null ? '' : String(dose.amount));
      setAgoMin(null);
      setSite(dose.site);
      setNotes(dose.notes ?? '');
    } else {
      setAmountText(compound.default_amount === null ? '' : String(compound.default_amount));
      setAgoMin(0);
      const lastSite = recent.find((d) => d.site)?.site ?? null;
      setSite(compound.form === 'injection' ? nextSite(lastSite) : null);
      setNotes('');
    }
    // Only when the target changes (see `target` above), not on every reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const amount = parseAmount(amountText);
  const canSave = !saving && !!compound && amount !== 'invalid';
  const lastSite = recent.find((d) => d.site && d.id !== editing?.id)?.site ?? null;

  async function save() {
    if (!canSave || !compound) return;
    setSaving(true);
    const takenAt = agoMin === null && editing ? editing.taken_at : Date.now() - (agoMin ?? 0) * 60_000;
    const input = { amount, unit: editing?.unit ?? compound.unit, taken_at: takenAt, site, notes };
    try {
      if (editing) await updateDose(db, editing.id, input);
      else await logDose(db, compound.id, input);
      router.back();
    } catch (err) {
      console.warn('Could not save dose', err);
      Alert.alert("Couldn't save", 'Something went wrong. Try again.');
      setSaving(false);
    }
  }

  function confirmDelete() {
    if (!editing) return;
    Alert.alert('Delete this dose?', `Logged ${dayAndTime(editing.taken_at)}.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          deleteDose(db, editing.id)
            .then(() => router.back())
            .catch((err) => console.warn('Could not delete dose', err)),
      },
    ]);
  }

  const inputStyle = [formStyles.input, { backgroundColor: theme.backgroundElement, color: theme.text }];

  if (compound === null) {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={[formStyles.safeArea, { backgroundColor: theme.background }]}>
        <ModalTopBar title="Log dose" canSave={false} onSave={() => {}} />
        <ThemedText themeColor="textSecondary" style={styles.center}>
          This was deleted.
        </ThemedText>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={[formStyles.safeArea, { backgroundColor: theme.background }]}>
      <ModalTopBar title={compound ? compound.name : 'Log dose'} canSave={canSave} onSave={save} />

      <KeyboardAvoidingView style={formStyles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={formStyles.body} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
          {editing ? (
            <ThemedText type="small" themeColor="textSecondary">
              Editing the dose from {dayAndTime(editing.taken_at)}.
            </ThemedText>
          ) : null}

          <FormField label={`Amount${compound ? ` (${editing?.unit ?? compound.unit})` : ''}`} hint="Leave empty to just tick it off.">
            <TextInput
              value={amountText}
              onChangeText={setAmountText}
              placeholder="Amount"
              placeholderTextColor={theme.textSecondary}
              keyboardType="decimal-pad"
              maxLength={9}
              style={inputStyle}
            />
            {amount === 'invalid' ? (
              <ThemedText type="small" themeColor="danger">
                Enter a number, like 5 or 2.5.
              </ThemedText>
            ) : null}
          </FormField>

          <FormField label="When">
            <View style={formStyles.chips}>
              {editing ? (
                <Chip label={`Keep ${formatTime(editing.taken_at)}`} selected={agoMin === null} onPress={() => setAgoMin(null)} />
              ) : null}
              {AGO.map((a) => (
                <Chip key={a.min} label={a.label} selected={agoMin === a.min} onPress={() => setAgoMin(a.min)} />
              ))}
            </View>
          </FormField>

          {compound?.form === 'injection' ? (
            <FormField
              label="Site"
              hint={lastSite ? `Last time: ${lastSite}. Ferro suggests the next spot so you rotate.` : undefined}>
              <View style={formStyles.chips}>
                {SITES.map((s) => (
                  <Chip key={s} label={s} selected={site === s} onPress={() => setSite(site === s ? null : s)} />
                ))}
              </View>
            </FormField>
          ) : null}

          <FormField label="Notes" hint="Optional. Anything worth remembering, like how you felt.">
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Notes"
              placeholderTextColor={theme.textSecondary}
              multiline
              maxLength={2000}
              style={[inputStyle, styles.notes]}
            />
          </FormField>

          {editing ? <FormButton label="Delete this dose" danger onPress={confirmDelete} /> : null}

          {recent.length > 0 ? (
            <FormField label="Recent">
              <ThemedView type="backgroundElement" style={styles.list}>
                {recent.map((d, i) => (
                  <Pressable
                    key={d.id}
                    onPress={() => router.setParams({ doseId: d.id })}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit dose from ${dayAndTime(d.taken_at)}`}
                    style={({ pressed }) => [
                      styles.listRow,
                      i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.backgroundSelected },
                      { opacity: pressed ? 0.7 : 1 },
                    ]}>
                    <ThemedText type="small" themeColor={d.id === editing?.id ? 'accent' : 'text'}>
                      {dayAndTime(d.taken_at)}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.listDetail}>
                      {[formatAmount(d.amount, d.unit), d.site].filter(Boolean).join(' · ') || 'Taken'}
                    </ThemedText>
                  </Pressable>
                ))}
              </ThemedView>
            </FormField>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** "Today 8:04 am" or "Nov 8, 8:04 am". */
function dayAndTime(ms: number) {
  const d = new Date(ms);
  const sameDay = d.toDateString() === new Date().toDateString();
  const day = sameDay ? 'today' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${day}, ${formatTime(ms)}`;
}

const styles = StyleSheet.create({
  center: { textAlign: 'center', padding: Spacing.three },
  notes: { minHeight: 80, textAlignVertical: 'top' },
  list: { borderRadius: 14, overflow: 'hidden' },
  listRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: 12,
  },
  listDetail: { flexShrink: 1, textAlign: 'right' },
});
