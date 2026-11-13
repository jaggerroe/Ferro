import { router } from 'expo-router';
import { type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Small building blocks for the Meds form screens (add/edit a compound,
 * log a dose). Same look as the New exercise screen.
 */

/** Cancel on the left, a title in the middle, Save on the right. */
export function ModalTopBar({ title, canSave, onSave }: { title: string; canSave: boolean; onSave: () => void }) {
  return (
    <View style={formStyles.topBar}>
      <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={8}>
        <ThemedText themeColor="textSecondary" style={formStyles.barButton}>
          Cancel
        </ThemedText>
      </Pressable>
      <ThemedText style={formStyles.heading} numberOfLines={1}>
        {title}
      </ThemedText>
      <Pressable
        onPress={onSave}
        disabled={!canSave}
        accessibilityRole="button"
        accessibilityState={{ disabled: !canSave }}
        hitSlop={8}>
        <ThemedText
          type="smallBold"
          themeColor={canSave ? 'accent' : 'textSecondary'}
          style={[formStyles.barButton, !canSave && formStyles.disabled]}>
          Save
        </ThemedText>
      </Pressable>
    </View>
  );
}

/** A labeled block in a form, with an optional hint underneath. */
export function FormField({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <View style={formStyles.field}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={formStyles.label}>
        {label}
      </ThemedText>
      {children}
      {hint ? (
        <ThemedText type="small" themeColor="textSecondary">
          {hint}
        </ThemedText>
      ) : null}
    </View>
  );
}

/** A full-width text button, e.g. "Delete" at the bottom of a form. */
export function FormButton({
  label,
  onPress,
  danger = false,
}: {
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        formStyles.button,
        { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.8 : 1 },
      ]}>
      <ThemedText style={formStyles.buttonLabel} themeColor={danger ? 'danger' : 'accent'}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

export const formStyles = StyleSheet.create({
  safeArea: { flex: 1 },
  flex: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  heading: { flexShrink: 1, fontSize: 17, lineHeight: 22, fontWeight: 800 },
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
  button: { borderRadius: 14, paddingVertical: Spacing.three, alignItems: 'center' },
  buttonLabel: { fontSize: 16, fontWeight: 700 },
});
