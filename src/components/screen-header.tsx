import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

type ScreenHeaderProps = {
  title: string;
};

/** Big screen title on the left, profile picture button on the right. */
export function ScreenHeader({ title }: ScreenHeaderProps) {
  return (
    <View style={styles.row}>
      <ThemedText style={styles.title}>{title}</ThemedText>
      <Pressable
        onPress={() => router.push('/profile')}
        accessibilityRole="button"
        accessibilityLabel="Open profile and settings"
        hitSlop={8}
        style={({ pressed }) => pressed && styles.pressed}>
        <Avatar size={36} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.three,
  },
  title: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: 800,
    letterSpacing: -0.5,
  },
  pressed: {
    opacity: 0.6,
  },
});
