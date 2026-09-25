import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

type AvatarProps = {
  size?: number;
  /** Until accounts exist, we show an initial instead of a photo. */
  initial?: string;
};

export function Avatar({ size = 36, initial = 'J' }: AvatarProps) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: theme.accent },
      ]}>
      <ThemedText
        style={{ color: theme.onAccent, fontSize: size * 0.45, lineHeight: size * 0.55, fontWeight: 800 }}>
        {initial}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
