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
  addLabResult,
  COMMON_LAB_UNITS,
  COMMON_MARKERS,
  deleteLabResult,
  formatDateInput,
  getLabResult,
  getLabResults,
  markerKey,
  mergeTags,
  parseDateInput,
  updateLabResult,
  type LabResult,
} from '@/lib/health';
import { parseAmount as parseNumber } from '@/lib/meds';

/**
 * Add a lab result, or edit one (`/lab-result?id=...`).
 * `?marker=ALT` starts a new result for that marker, copying the unit and
 * normal range from your last ALT result.
 */
export default function LabResultScreen() {
  const theme = useTheme();
  const db = useSQLiteContext();
  const { id, marker: startMarker } = useLocalSearchParams<{ id?: string; marker?: string }>();

  const [existing, setExisting] = useState<LabResult | null | undefined>(id ? undefined : null);
  const [history, setHistory] = useState<LabResult[]>([]);
  const [marker, setMarker] = useState(startMarker ?? '');
  const [valueText, setValueText] = useState('');
  const [unit, setUnit] = useState('');
  const [dateText, setDateText] = useState(formatDateInput(Date.now()));
  const [lowText, setLowText] = useState('');
  const [highText, setHighText] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const all = await getLabResults(db);
      setHistory(all);
      if (id) {
        const r = await getLabResult(db, id);
        setExisting(r);
        if (r) {
          setMarker(r.marker);
          setValueText(String(r.value));
          setUnit(r.unit);
          setDateText(formatDateInput(r.drawn_at));
          setLowText(r.ref_low === null ? '' : String(r.ref_low));
          setHighText(r.ref_high === null ? '' : String(r.ref_high));
          setNotes(r.notes ?? '');
        }
      } else if (startMarker) {
        copyFromLast(all, startMarker);
      }
    })().catch((err) => console.warn('Could not load', err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, id]);

  /** New result for a marker you've logged before: reuse its unit and normal range. */
  function copyFromLast(all: LabResult[], name: string) {
    const last = [...all].reverse().find((r) => markerKey(r.marker) === markerKey(name));
    if (!last) return;
    setUnit(last.unit);
    setLowText(last.ref_low === null ? '' : String(last.ref_low));
    setHighText(last.ref_high === null ? '' : String(last.ref_high));
  }

  function pickMarker(name: string) {
    setMarker(name);
    if (!existing) copyFromLast(history, name);
  }

  const value = parseNumber(valueText);
  const low = parseNumber(lowText);
  const high = parseNumber(highText);
  const drawnAt = parseDateInput(dateText);
  const rangeBackwards = typeof low === 'number' && typeof high === 'number' && low > high;
  const canSave =
    !saving &&
    existing !== undefined &&
    marker.trim().length > 0 &&
    typeof value === 'number' &&
    unit.trim().length > 0 &&
    drawnAt !== null &&
    low !== 'invalid' &&
    high !== 'invalid' &&
    !rangeBackwards;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    const input = { drawn_at: drawnAt, marker, value, unit, ref_low: low, ref_high: high, notes };
    try {
      if (existing) await updateLabResult(db, existing.id, input);
      else await addLabResult(db, input);
      router.back();
    } catch (err) {
      console.warn('Could not save lab result', err);
      Alert.alert("Couldn't save", 'Something went wrong. Try again.');
      setSaving(false);
    }
  }

  function confirmDelete() {
    if (!existing) return;
    Alert.alert('Delete this result?', 'This can’t be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          deleteLabResult(db, existing.id)
            .then(() => router.back())
            .catch((err) => console.warn('Could not delete', err)),
      },
    ]);
  }

  const inputStyle = [formStyles.input, { backgroundColor: theme.backgroundElement, color: theme.text }];
  // Markers you've used before come first in the suggestions.
  const markerSuggestions = mergeTags([...history].reverse().map((r) => r.marker), COMMON_MARKERS).slice(0, 14);
  const unitSuggestions = mergeTags([...history].reverse().map((r) => r.unit), COMMON_LAB_UNITS).slice(0, 8);

  return (
    <SafeAreaView edges={['top', 'bottom']} style={[formStyles.safeArea, { backgroundColor: theme.background }]}>
      <ModalTopBar title={id ? 'Edit lab result' : 'Add lab result'} canSave={canSave} onSave={save} />

      {existing === null && id ? (
        <ThemedText themeColor="textSecondary" style={{ textAlign: 'center' }}>
          This was deleted.
        </ThemedText>
      ) : (
        <KeyboardAvoidingView style={formStyles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={formStyles.body} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
            <FormField label="Marker" hint="As it's written on your report.">
              <TextInput
                value={marker}
                onChangeText={setMarker}
                onEndEditing={() => !existing && copyFromLast(history, marker)}
                placeholder="e.g. ALT"
                placeholderTextColor={theme.textSecondary}
                autoCapitalize="words"
                autoCorrect={false}
                maxLength={40}
                style={inputStyle}
              />
              <View style={formStyles.chips}>
                {markerSuggestions.map((m) => (
                  <Chip key={m} label={m} selected={markerKey(marker) === markerKey(m)} onPress={() => pickMarker(m)} />
                ))}
              </View>
            </FormField>

            <FormField label="Result">
              <TextInput
                value={valueText}
                onChangeText={setValueText}
                placeholder="Value"
                placeholderTextColor={theme.textSecondary}
                keyboardType="decimal-pad"
                maxLength={9}
                style={inputStyle}
              />
              {value === 'invalid' ? <Problem text="Enter a number, like 32 or 1.5." /> : null}
              <TextInput
                value={unit}
                onChangeText={setUnit}
                placeholder="Unit, e.g. mg/dL"
                placeholderTextColor={theme.textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={20}
                style={inputStyle}
              />
              <View style={formStyles.chips}>
                {unitSuggestions.map((u) => (
                  <Chip key={u} label={u} selected={unit === u} onPress={() => setUnit(u)} />
                ))}
              </View>
            </FormField>

            <FormField label="Date of the test" hint="Month/day/year.">
              <TextInput
                value={dateText}
                onChangeText={setDateText}
                placeholder="11/13/2026"
                placeholderTextColor={theme.textSecondary}
                keyboardType="numbers-and-punctuation"
                maxLength={10}
                style={inputStyle}
              />
              {drawnAt === null ? <Problem text="Enter a date like 11/13/2026." /> : null}
            </FormField>

            <FormField label="Normal range (optional)" hint="Copy it from your report, if it's printed there.">
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <TextInput
                  value={lowText}
                  onChangeText={setLowText}
                  placeholder="Low"
                  placeholderTextColor={theme.textSecondary}
                  keyboardType="decimal-pad"
                  maxLength={9}
                  style={[inputStyle, formStyles.flex]}
                />
                <TextInput
                  value={highText}
                  onChangeText={setHighText}
                  placeholder="High"
                  placeholderTextColor={theme.textSecondary}
                  keyboardType="decimal-pad"
                  maxLength={9}
                  style={[inputStyle, formStyles.flex]}
                />
              </View>
              {low === 'invalid' || high === 'invalid' ? <Problem text="Enter numbers, or leave them empty." /> : null}
              {rangeBackwards ? <Problem text="Low should be smaller than high." /> : null}
            </FormField>

            <FormField label="Notes" hint="Optional. Like fasting or not, or what your doctor said.">
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

            {existing ? <FormButton label="Delete this result" danger onPress={confirmDelete} /> : null}
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

function Problem({ text }: { text: string }) {
  return (
    <ThemedText type="small" themeColor="danger">
      {text}
    </ThemedText>
  );
}

