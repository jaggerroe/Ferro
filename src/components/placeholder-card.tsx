import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

type PlaceholderCardProps = {
  eyebrow?: string;
  title: string;
  body: string;
};

/** Temporary card that describes what a section will do once it's built. */
export function PlaceholderCard({ eyebrow, title, body }: PlaceholderCardProps) {
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      {eyebrow ? (
        <ThemedText type="smallBold" themeColor="accent" style={styles.eyebrow}>
          {eyebrow}
        </ThemedText>
      ) : null}
      <ThemedText style={styles.title}>{title}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {body}
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  eyebrow: {
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontSize: 12,
  },
  title: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: 700,
  },
});
