import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { ExerciseKind } from '@/data/exercises';
import { useTheme } from '@/hooks/use-theme';
import { weightUnitLabel } from '@/lib/settings';

/** What's typed in a set's boxes, kept as text so "135." is allowed mid-typing. */
export type SetDraft = { weight: string; reps: string; minutes: string; miles: string };

type SetRowProps = {
  index: number;
  kind: ExerciseKind;
  draft: SetDraft;
  /** Same boxes from last time, shown greyed out as placeholders. */
  previous?: SetDraft;
  completed: boolean;
  onChange: (draft: SetDraft) => void;
  onToggleComplete: () => void;
  onLongPress: () => void;
};

/** The input boxes each kind of exercise uses, in order. */
export const FIELDS_FOR_KIND: Record<ExerciseKind, { key: keyof SetDraft; label: string; decimal: boolean }[]> = {
  strength: [
    { key: 'weight', label: 'lb', decimal: true },
    { key: 'reps', label: 'Reps', decimal: false },
  ],
  bodyweight: [{ key: 'reps', label: 'Reps', decimal: false }],
  cardio: [
    { key: 'minutes', label: 'Min', decimal: true },
    { key: 'miles', label: 'Mi', decimal: true },
  ],
};

/** Column/placeholder label for a box. The weight box shows your unit (lb or kg). */
function fieldLabel(f: { key: keyof SetDraft; label: string }) {
  return f.key === 'weight' ? weightUnitLabel() : f.label;
}

/** One row in an exercise's set table: number, last time, input boxes, check button. */
export function SetRow({
  index,
  kind,
  draft,
  previous,
  completed,
  onChange,
  onToggleComplete,
  onLongPress,
}: SetRowProps) {
  const theme = useTheme();
  const fields = FIELDS_FOR_KIND[kind];

  return (
    <Pressable
      onLongPress={onLongPress}
      delayLongPress={400}
      style={[styles.row, completed && { backgroundColor: `${theme.accent}22` }]}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.setNumber}>
        {index + 1}
      </ThemedText>

      <ThemedText type="small" themeColor="textSecondary" style={styles.previous} numberOfLines={1}>
        {previous ? describeDraft(kind, previous) : '—'}
      </ThemedText>

      {fields.map((f) => (
        <TextInput
          key={f.key}
          value={draft[f.key]}
          onChangeText={(text) => onChange({ ...draft, [f.key]: cleanNumber(text, f.decimal) })}
          placeholder={previous?.[f.key] || fieldLabel(f)}
          placeholderTextColor={theme.textSecondary}
          keyboardType={f.decimal ? 'decimal-pad' : 'number-pad'}
          selectTextOnFocus
          maxLength={7}
          accessibilityLabel={`Set ${index + 1} ${fieldLabel(f)}`}
          style={[
            styles.input,
            {
              backgroundColor: completed ? 'transparent' : theme.backgroundSelected,
              color: theme.text,
            },
          ]}
        />
      ))}

      <Pressable
        onPress={onToggleComplete}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: completed }}
        accessibilityLabel={`Mark set ${index + 1} done`}
        hitSlop={6}
        style={[
          styles.check,
          { backgroundColor: completed ? theme.accent : theme.backgroundSelected },
        ]}>
        <ThemedText
          type="smallBold"
          style={[styles.checkMark, { color: completed ? theme.onAccent : theme.textSecondary }]}>
          ✓
        </ThemedText>
      </Pressable>
    </Pressable>
  );
}

/** Column headings that line up with SetRow. */
export function SetHeader({ kind }: { kind: ExerciseKind }) {
  return (
    <View style={styles.row}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={[styles.setNumber, styles.heading]}>
        Set
      </ThemedText>
      <ThemedText type="smallBold" themeColor="textSecondary" style={[styles.previous, styles.heading]}>
        Previous
      </ThemedText>
      {FIELDS_FOR_KIND[kind].map((f) => (
        <ThemedText
          key={f.key}
          type="smallBold"
          themeColor="textSecondary"
          style={[styles.inputHeading, styles.heading]}>
          {fieldLabel(f)}
        </ThemedText>
      ))}
      <View style={styles.checkSpacer} />
    </View>
  );
}

/** "135 × 8", "× 12", or "20 min · 2 mi" */
export function describeDraft(kind: ExerciseKind, d: SetDraft) {
  if (kind === 'strength') return d.weight || d.reps ? `${d.weight || '0'} × ${d.reps || '0'}` : '—';
  if (kind === 'bodyweight') return d.reps ? `× ${d.reps}` : '—';
  const parts = [d.minutes && `${d.minutes} min`, d.miles && `${d.miles} mi`].filter(Boolean);
  return parts.length ? parts.join(' · ') : '—';
}

/** Keeps only digits (and one decimal point if allowed). */
function cleanNumber(text: string, decimal: boolean) {
  const normalized = text.replace(',', '.');
  if (!decimal) return normalized.replace(/[^0-9]/g, '');
  const [whole, ...rest] = normalized.replace(/[^0-9.]/g, '').split('.');
  return rest.length ? `${whole}.${rest.join('')}` : whole;
}

const INPUT_WIDTH = 64;
const CHECK_SIZE = 34;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: 6,
    borderRadius: 10,
  },
  heading: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  setNumber: { width: 28, textAlign: 'center' },
  previous: { flex: 1 },
  input: {
    width: INPUT_WIDTH,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 6,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  inputHeading: { width: INPUT_WIDTH, textAlign: 'center' },
  check: {
    width: CHECK_SIZE,
    height: CHECK_SIZE,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: { fontSize: 16, lineHeight: 20 },
  checkSpacer: { width: CHECK_SIZE },
});
