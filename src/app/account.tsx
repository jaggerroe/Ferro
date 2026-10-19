import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Chip } from '@/components/chip';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { AuthMessage, signIn, signUp, USERNAME_RULE } from '@/lib/auth';
import { isBackendConfigured } from '@/lib/supabase';

type Mode = 'signin' | 'signup';

/** Sign in or create an account. Opened from Profile. */
export default function AccountScreen() {
  const theme = useTheme();
  const [mode, setMode] = useState<Mode>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);

  const cleanUsername = username.trim().toLowerCase();
  const usernameOk = USERNAME_RULE.test(cleanUsername);
  const canSubmit =
    !busy && email.includes('@') && password.length >= 6 && (mode === 'signin' || usernameOk);

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === 'signin') {
        await signIn(email, password);
        router.back();
      } else {
        const signedIn = await signUp(email, password, cleanUsername);
        if (signedIn) router.back();
        else setCheckEmail(true);
      }
    } catch (err) {
      setError(err instanceof AuthMessage ? err.message : 'Something went wrong. Try again.');
      if (!(err instanceof AuthMessage)) console.warn('Auth failed', err);
    } finally {
      setBusy(false);
    }
  }

  const inputStyle = [styles.input, { backgroundColor: theme.backgroundElement, color: theme.text }];

  return (
    <SafeAreaView edges={['top', 'bottom']} style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <View style={styles.topBar}>
        <ThemedText style={styles.heading}>{mode === 'signin' ? 'Sign in' : 'Create account'}</ThemedText>
        <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={8}>
          <ThemedText themeColor="textSecondary" style={styles.barButton}>
            Cancel
          </ThemedText>
        </Pressable>
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {!isBackendConfigured ? (
            <ThemedText themeColor="textSecondary">
              Accounts aren’t set up yet. Add your Supabase URL and publishable key to .env.local, then restart
              Expo with npx.cmd expo start -c.
            </ThemedText>
          ) : checkEmail ? (
            <View style={styles.confirm}>
              <ThemedText style={styles.confirmTitle}>Check your email</ThemedText>
              <ThemedText themeColor="textSecondary">
                We sent a link to {email.trim()}. Tap it to confirm your account, then come back and sign in.
              </ThemedText>
              <Pressable
                onPress={() => {
                  setCheckEmail(false);
                  setMode('signin');
                }}
                accessibilityRole="button"
                style={({ pressed }) => [styles.submit, { backgroundColor: theme.accent, opacity: pressed ? 0.8 : 1 }]}>
                <ThemedText style={[styles.submitLabel, { color: theme.onAccent }]}>Go to sign in</ThemedText>
              </Pressable>
            </View>
          ) : (
            <>
              <ThemedText type="small" themeColor="textSecondary">
                An account backs up your workouts, routines and settings, and brings them back on a new phone.
              </ThemedText>

              <View style={styles.modes}>
                <Chip label="Create account" selected={mode === 'signup'} onPress={() => setMode('signup')} />
                <Chip label="Sign in" selected={mode === 'signin'} onPress={() => setMode('signin')} />
              </View>

              {mode === 'signup' ? (
                <View style={styles.field}>
                  <ThemedText type="smallBold" themeColor="textSecondary" style={styles.label}>
                    Username
                  </ThemedText>
                  <TextInput
                    value={username}
                    onChangeText={setUsername}
                    placeholder="jagger_lifts"
                    placeholderTextColor={theme.textSecondary}
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={20}
                    style={inputStyle}
                  />
                  <ThemedText type="small" themeColor={username && !usernameOk ? 'danger' : 'textSecondary'}>
                    3–20 characters: letters, numbers and underscores. Friends will find you by this.
                  </ThemedText>
                </View>
              ) : null}

              <View style={styles.field}>
                <ThemedText type="smallBold" themeColor="textSecondary" style={styles.label}>
                  Email
                </ThemedText>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  placeholderTextColor={theme.textSecondary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  autoComplete="email"
                  style={inputStyle}
                />
              </View>

              <View style={styles.field}>
                <ThemedText type="smallBold" themeColor="textSecondary" style={styles.label}>
                  Password
                </ThemedText>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="At least 6 characters"
                  placeholderTextColor={theme.textSecondary}
                  secureTextEntry
                  textContentType={mode === 'signup' ? 'newPassword' : 'password'}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  onSubmitEditing={submit}
                  returnKeyType="go"
                  style={inputStyle}
                />
              </View>

              {error ? (
                <ThemedText type="smallBold" themeColor="danger">
                  {error}
                </ThemedText>
              ) : null}

              <Pressable
                onPress={submit}
                disabled={!canSubmit}
                accessibilityRole="button"
                accessibilityState={{ disabled: !canSubmit }}
                style={({ pressed }) => [
                  styles.submit,
                  { backgroundColor: theme.accent, opacity: !canSubmit ? 0.5 : pressed ? 0.8 : 1 },
                ]}>
                {busy ? (
                  <ActivityIndicator color={theme.onAccent} />
                ) : (
                  <ThemedText style={[styles.submitLabel, { color: theme.onAccent }]}>
                    {mode === 'signin' ? 'Sign in' : 'Create account'}
                  </ThemedText>
                )}
              </Pressable>

              <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
                Your workouts stay on this phone either way. Signing in adds a backup.
              </ThemedText>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
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
  heading: { fontSize: 20, lineHeight: 26, fontWeight: 800 },
  barButton: { fontSize: 16 },
  body: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.six, gap: Spacing.three },
  modes: { flexDirection: 'row', gap: Spacing.two },
  field: { gap: Spacing.two },
  label: { textTransform: 'uppercase', letterSpacing: 1, fontSize: 12 },
  input: { borderRadius: 12, paddingHorizontal: Spacing.three, paddingVertical: 12, fontSize: 16 },
  submit: { borderRadius: 14, paddingVertical: Spacing.three, alignItems: 'center', minHeight: 54, justifyContent: 'center' },
  submitLabel: { fontSize: 17, fontWeight: 800 },
  note: { textAlign: 'center' },
  confirm: { gap: Spacing.three },
  confirmTitle: { fontSize: 22, lineHeight: 28, fontWeight: 800 },
});
