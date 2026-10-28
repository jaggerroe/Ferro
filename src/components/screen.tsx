import { type ReactElement, type ReactNode } from 'react';
import { ScrollView, StyleSheet, type RefreshControlProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/screen-header';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ScreenProps = {
  title: string;
  children?: ReactNode;
  /** Optional pull-to-refresh, for screens that load from the internet (Friends). */
  refreshControl?: ReactElement<RefreshControlProps>;
};

/**
 * Shared wrapper for every tab: safe-area padding, the header with the
 * profile button, and a scrollable body that stays clear of the tab bar.
 */
export function Screen({ title, children, refreshControl }: ScreenProps) {
  const theme = useTheme();

  return (
    <SafeAreaView edges={['top']} style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <ScreenHeader title={title} />
      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={refreshControl}
        // Lets you tap buttons in search results while the keyboard is up.
        keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  body: {
    paddingHorizontal: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.five,
    gap: Spacing.three,
  },
});
