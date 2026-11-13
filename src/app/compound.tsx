import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Chip } from '@/components/chip';
import { FormButton, FormField, formStyles, ModalTopBar } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import {
  addCompound,
  deleteCompound,
  EVERY_N_OPTIONS,
  FORMS,
  getCompound,
  KINDS,
  parseAmount,
  SCHEDULES,
  setCompoundEnded,
  TIMES,
  UNITS,
  updateCompound,
  WEEKDAYS,
  type Compound,
  type CompoundForm,
  type CompoundKind,
  type Schedule,
} from '@/lib/meds';

/**
 * Add something to the Meds tab, or edit it (`/compound?id=...`).
 * You type the name yourself; Ferro has no built-in list of drugs.
 */
export default function CompoundScreen() {
  const theme = useTheme();
  const db = useSQLiteContext();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [existing, setExisting] = useState<Compound | null | undefined>(id ? undefined : null);

  const [name, setName] = useState('');
  const [kind, setKind] = useState<CompoundKind>('supplement');
  const [form, setForm] = useState<CompoundForm>('pill');
  const [unit, setUnit] = useState<string>('mg');
  const [amountText, setAmountText] = useState('');
  const [schedule, setSchedule] = useState<Schedule>('daily');
  const [days, setDays] = useState<number[]>([1, 3, 5]);
  const [everyN, setEveryN] = useState(2);
  const [times, setTimes] = useState<string[]>(['08:00']);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Editing: fill the form in once it's loaded.
  useEffect(() => {
    if (!id) return;
    getCompound(db, id)
      .then((c) => {
        setExisting(c);
        if (!c) return;
        setName(c.name);
        setKind(c.kind);
        setForm(c.form);
        setUnit(c.unit);
        setAmountText(c.default_amount === null ? '' : String(c.default_amount));
        setSchedule(c.schedule);
        if (c.schedule_days.length) setDays(c.schedule_days);
        if (c.every_n) setEveryN(c.every_n);
        if (c.times.length) setTimes(c.times);
        setNotes(c.notes ?? '');
      })
      .catch((err) => console.warn('Could not load', err));
  }, [db, id]);

  const amount = parseAmount(amountText);
  const trimmed = name.trim();
  const canSave =
    !saving &&
    trimmed.length > 0 &&
    amount !== 'invalid' &&
    (schedule !== 'days' || days.length > 0) &&
    (schedule === 'as_needed' || times.length > 0) &&
    existing !== undefined;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    const input = {
      name: trimmed,
      kind,
      form,
      unit,
      default_amount: amount,
      schedule,
      schedule_days: schedule === 'days' ? days.slice().sort() : [],
      every_n: schedule === 'every_n' ? everyN : null,
      times: schedule === 'as_needed' ? [] : times.slice().sort(),
      notes,
    };
    try {
      if (existing) await updateCompound(db, existing.id, input);
      else await addCompound(db, input);
      router.back();
    } catch (err) {
      console.warn('Could not save', err);
      Alert.alert("Couldn't save", 'Something went wrong. Try again.');
      setSaving(false);
    }
  }

  function toggle<T>(list: T[], value: T) {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  }

  function confirmFinish() {
    if (!existing) return;
    Alert.alert(`Finish ${existing.name}?`, 'It stops showing on Today. Your logged doses are kept, and you can restart it anytime.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Finish',
        onPress: () =>
          setCompoundEnded(db, existing.id, Date.now())
            .then(() => router.back())
            .catch((err) => console.warn('Could not finish', err)),
      },
    ]);
  }

  function restart() {
    if (!existing) return;
    setCompoundEnded(db, existing.id, null)
      .then(() => router.back())
      .catch((err) => console.warn('Could not restart', err));
  }

  function confirmDelete() {
    if (!existing) return;
    Alert.alert(`Delete ${existing.name}?`, 'This also deletes every dose you logged for it. This can’t be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          deleteCompound(db, existing.id)
            .then(() => router.back())
            .catch((err) => console.warn('Could not delete', err)),
      },
    ]);
  }

  const inputStyle = [formStyles.input, { backgroundColor: theme.backgroundElement, color: theme.text }];

  return (
    <SafeAreaView edges={['top', 'bottom']} style={[formStyles.safeArea, { backgroundColor: theme.background }]}>
      <ModalTopBar title={id ? 'Edit' : 'Add to Meds'} canSave={canSave} onSave={save} />

      {existing === null && id ? (
        <ThemedText themeColor="textSecondary" style={{ textAlign: 'center' }}>
          This was deleted.
        </ThemedText>
      ) : (
        <KeyboardAvoidingView style={formStyles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            contentContainerStyle={formStyles.body}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag">
            <FormField label="Name">
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="e.g. Creatine"
                placeholderTextColor={theme.textSecondary}
                autoFocus={!id}
                autoCapitalize="words"
                autoCorrect={false}
                maxLength={60}
                style={inputStyle}
              />
            </FormField>

            <FormField label="Type">
              <View style={formStyles.chips}>
                {(Object.keys(KINDS) as CompoundKind[]).map((k) => (
                  <Chip key={k} label={KINDS[k]} selected={kind === k} onPress={() => setKind(k)} />
                ))}
              </View>
            </FormField>

            <FormField label="Form">
              <View style={formStyles.chips}>
                {(Object.keys(FORMS) as CompoundForm[]).map((f) => (
                  <Chip key={f} label={FORMS[f]} selected={form === f} onPress={() => setForm(f)} />
                ))}
              </View>
            </FormField>

            <FormField label="Usual amount" hint="Optional. Filled in for you when you log a dose.">
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
              <View style={formStyles.chips}>
                {UNITS.map((u) => (
                  <Chip key={u} label={u} selected={unit === u} onPress={() => setUnit(u)} />
                ))}
              </View>
            </FormField>

            <FormField label="How often">
              <View style={formStyles.chips}>
                {SCHEDULES.map((s) => (
                  <Chip key={s.value} label={s.label} selected={schedule === s.value} onPress={() => setSchedule(s.value)} />
                ))}
              </View>
            </FormField>

            {schedule === 'days' ? (
              <FormField label="Which days">
                <View style={formStyles.chips}>
                  {WEEKDAYS.map((label, day) => (
                    <Chip key={label} label={label} selected={days.includes(day)} onPress={() => setDays(toggle(days, day))} />
                  ))}
                </View>
              </FormField>
            ) : null}

            {schedule === 'every_n' ? (
              <FormField label="Every" hint="Counted from the day you added it.">
                <View style={formStyles.chips}>
                  {EVERY_N_OPTIONS.map((n) => (
                    <Chip key={n} label={`${n} days`} selected={everyN === n} onPress={() => setEveryN(n)} />
                  ))}
                </View>
              </FormField>
            ) : null}

            {schedule !== 'as_needed' ? (
              <FormField label="When" hint="Pick two for twice a day.">
                <View style={formStyles.chips}>
                  {TIMES.map((t) => (
                    <Chip key={t.value} label={t.label} selected={times.includes(t.value)} onPress={() => setTimes(toggle(times, t.value))} />
                  ))}
                </View>
              </FormField>
            ) : null}

            <FormField label="Notes" hint="Optional. Like who prescribed it or how to take it.">
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="Notes"
                placeholderTextColor={theme.textSecondary}
                multiline
                maxLength={2000}
                style={[inputStyle, { minHeight: 80, textAlignVertical: 'top' }]}
              />
            </FormField>

            {existing ? (
              <View style={formStyles.field}>
                {existing.ended_at === null ? (
                  <FormButton label="Mark as finished" onPress={confirmFinish} />
                ) : (
                  <FormButton label="Start again" onPress={restart} />
                )}
                <FormButton label="Delete" danger onPress={confirmDelete} />
              </View>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

