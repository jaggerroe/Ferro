import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const SECTIONS = [
  { title: 'Preferences', rows: ['Units (lb / kg)', 'Default rest timer', 'Theme'] },
  { title: 'Account', rows: ['Edit profile', 'Sign out', 'Delete account'] },
];

export default function ProfileScreen() {
  const theme = useTheme();

  return (
    <SafeAreaView edges={['top', 'bottom']} style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <View style={styles.topBar}>
        <ThemedText style={styles.heading}>Profile</ThemedText>
        <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={8}>
          <ThemedText type="smallBold" themeColor="accent" style={styles.done}>
            Done
          </ThemedText>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.identity}>
          <Avatar size={80} />
          <ThemedText style={styles.name}>Jagger</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Accounts and usernames come with the backend
          </ThemedText>
        </View>

        {SECTIONS.map((section) => (
          <View key={section.title} style={styles.section}>
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionTitle}>
              {section.title}
            </ThemedText>
            <ThemedView type="backgroundElement" style={styles.group}>
              {section.rows.map((row, i) => (
                <View
                  key={row}
                  style={[
                    styles.row,
                    i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.backgroundSelected },
                  ]}>
                  <ThemedText>{row}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    Soon
                  </ThemedText>
                </View>
              ))}
            </ThemedView>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  heading: { fontSize: 20, lineHeight: 26, fontWeight: 800 },
  done: { fontSize: 16 },
  body: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.five, gap: Spacing.four },
  identity: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.three },
  name: { fontSize: 24, lineHeight: 30, fontWeight: 800 },
  section: { gap: Spacing.two },
  sectionTitle: { textTransform: 'uppercase', letterSpacing: 1, fontSize: 12, paddingHorizontal: Spacing.two },
  group: { borderRadius: 14, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: 14,
  },
});
