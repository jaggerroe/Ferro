import { type ReactElement, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type RefreshControlProps } from 'react-native';
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
 *
 * For long lists (History, Progress, the friend feed) use `ScreenFrame`
 * with a FlatList/SectionList instead. A plain ScrollView draws every
 * item at once; those lists only draw what's on screen, so they stay fast
 * with years of workouts.
 */
export function Screen({ title, children, refreshControl }: ScreenProps) {
  return (
    <ScreenFrame title={title}>
      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={refreshControl}
        // Lets you tap buttons in search results while the keyboard is up.
        keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </ScreenFrame>
  );
}

/** Safe area + header, with no scrolling of its own. Put a FlatList or SectionList inside. */
export function ScreenFrame({ title, children }: { title: string; children?: ReactNode }) {
  const theme = useTheme();
  return (
    <SafeAreaView edges={['top']} style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <ScreenHeader title={title} />
      {children}
    </SafeAreaView>
  );
}

/**
 * Padding for a list inside ScreenFrame, matching Screen. Lists space their
 * items with `ItemSeparatorComponent` (e.g. `ListGap`) instead of `gap`.
 */
export const listContentStyle = {
  paddingHorizontal: Spacing.three,
  paddingBottom: BottomTabInset + Spacing.five,
} as const;

/** Empty space between list items (16 by default, like Screen's gap). */
export function ListGap({ size = Spacing.three }: { size?: number }) {
  return <View style={{ height: size }} />;
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
