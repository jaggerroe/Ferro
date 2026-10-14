import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState, type ReactNode } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Chip } from '@/components/chip';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import {
  defaultKind,
  EQUIPMENT,
  KIND_LABELS,
  MUSCLE_GROUPS,
  type Equipment,
  type ExerciseKind,
  type MuscleGroup,
} from '@/data/exercises';
import { addCustomExercise, exerciseNameTaken, useAllExercises } from '@/lib/custom-exercises';
import { useTheme } from '@/hooks/use-theme';

const KINDS = Object.keys(KIND_LABELS) as ExerciseKind[];

export default function NewExerciseScreen() {
  const theme = useTheme();
  const db = useSQLiteContext();
  const allExercises = useAllExercises();

  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [muscle, setMuscle] = useState<MuscleGroup | null>(null);
  const [secondary, setSecondary] = useState<MuscleGroup[]>([]);
  const [equipment, setEquipment] = useState<Equipment | null>(null);
  // null = "let Ferro guess from the muscle + equipment". Picking one locks it in.
  const [kindOverride, setKindOverride] = useState<ExerciseKind | null>(null);

  const kind: ExerciseKind | null =
    kindOverride ?? (muscle && equipment ? defaultKind(muscle, equipment) : null);

  const trimmed = name.trim();
  const duplicate = trimmed.length > 0 && exerciseNameTaken(trimmed, allExercises);
  const canSave = !saving && trimmed.length > 0 && !duplicate && muscle !== null && equipment !== null && kind !== null;

  function pickMuscle(m: MuscleGroup) {
    setMuscle(m);
    // A muscle can't be both the main group and a secondary one.
    setSecondary((prev) => prev.filter((s) => s !== m));
  }

  function toggleSecondary(m: MuscleGroup) {
    setSecondary((prev) => (prev.includes(m) ? prev.filter((s) => s !== m) : [...prev, m]));
  }

  async function save() {
    if (!canSave || !muscle || !equipment || !kind) return;
    setSaving(true);
    try {
      await addCustomExercise(db, { name: trimmed, muscle, secondary, equipment, kind });
      router.back();
    } catch (err) {
      console.warn('Could not save exercise', err);
      Alert.alert("Couldn't save exercise", 'Something went wrong saving it. Try again.');
      setSaving(false);
    }
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={8}>
          <ThemedText themeColor="textSecondary" style={styles.barButton}>
            Cancel
          </ThemedText>
        </Pressable>
        <ThemedText style={styles.heading}>New exercise</ThemedText>
        <Pressable
          onPress={save}
          disabled={!canSave}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSave }}
          hitSlop={8}>
          <ThemedText
            type="smallBold"
            themeColor={canSave ? 'accent' : 'textSecondary'}
            style={[styles.barButton, !canSave && styles.disabled]}>
            Save
          </ThemedText>
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag">
          <Field label="Name" error={duplicate ? 'You already have an exercise with this name.' : undefined}>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="e.g. Landmine Press"
              placeholderTextColor={theme.textSecondary}
              autoFocus
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="done"
              maxLength={60}
              style={[styles.input, { backgroundColor: theme.backgroundElement, color: theme.text }]}
            />
          </Field>

          <Field label="Main body group">
            <View style={styles.chips}>
              {MUSCLE_GROUPS.map((m) => (
                <Chip key={m} label={m} selected={muscle === m} onPress={() => pickMuscle(m)} />
              ))}
            </View>
          </Field>

          <Field label="Also works" hint="Optional. Pick any that apply.">
            <View style={styles.chips}>
              {MUSCLE_GROUPS.filter((m) => m !== muscle).map((m) => (
                <Chip
                  key={m}
                  label={m}
                  selected={secondary.includes(m)}
                  onPress={() => toggleSecondary(m)}
                />
              ))}
            </View>
          </Field>

          <Field label="Equipment">
            <View style={styles.chips}>
              {EQUIPMENT.map((eq) => (
                <Chip key={eq} label={eq} selected={equipment === eq} onPress={() => setEquipment(eq)} />
              ))}
            </View>
          </Field>

          <Field
            label="Logged as"
            hint={kindOverride ? undefined : 'Ferro picks this from the group and equipment. Tap to change it.'}>
            <View style={styles.chips}>
              {KINDS.map((k) => (
                <Chip key={k} label={KIND_LABELS[k]} selected={kind === k} onPress={() => setKindOverride(k)} />
              ))}
            </View>
          </Field>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** A labeled block in the form, with an optional hint or error underneath the label. */
function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.label}>
        {label}
      </ThemedText>
      {children}
      {error ? (
        <ThemedText type="small" style={{ color: theme.accent }}>
          {error}
        </ThemedText>
      ) : hint ? (
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
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  heading: { fontSize: 17, lineHeight: 22, fontWeight: 800 },
  barButton: { fontSize: 16 },
  disabled: { opacity: 0.5 },
  body: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.six, gap: Spacing.four },
  field: { gap: Spacing.two },
  label: { textTransform: 'uppercase', letterSpacing: 1, fontSize: 12 },
  input: {
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: 12,
    fontSize: 16,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
