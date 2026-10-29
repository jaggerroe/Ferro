import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';

/**
 * Accounts: sign up, sign in, sign out, delete. Accounts are optional; the
 * app works fully without one, and signing in turns on cloud backup.
 */

export const USERNAME_RULE = /^[a-z0-9_]{3,20}$/;

/** New passwords need at least this many characters. Set the same number in Supabase's Auth settings. */
export const MIN_PASSWORD_LENGTH = 8;

/** The signed-in session. `undefined` = still checking, `null` = signed out. */
export function useSession() {
  const [session, setSession] = useState<Session | null | undefined>(supabase ? undefined : null);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    supabase.auth.getSession().then(({ data }) => alive && setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return session;
}

/** Your username from the profiles table, or null while loading / signed out. */
export function useUsername(userId: string | undefined) {
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase || !userId) {
      setUsername(null);
      return;
    }
    let alive = true;
    supabase
      .from('profiles')
      .select('username')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => alive && setUsername(data?.username ?? null));
    return () => {
      alive = false;
    };
  }, [userId]);

  return username;
}

/** A plain-English error you can show on screen. */
export class AuthMessage extends Error {}

function requireBackend() {
  if (!supabase) throw new AuthMessage('Accounts aren’t set up yet. Add your Supabase keys to .env.local.');
  return supabase;
}

/** Returns true if you're signed in right away, false if you need to confirm your email first. */
export async function signUp(email: string, password: string, rawUsername: string) {
  const client = requireBackend();
  const username = rawUsername.trim().toLowerCase();
  if (!USERNAME_RULE.test(username)) {
    throw new AuthMessage('Usernames are 3–20 characters: letters, numbers and underscores.');
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new AuthMessage(`Use a password with at least ${MIN_PASSWORD_LENGTH} characters.`);
  }

  const { data: available, error: checkError } = await client.rpc('username_available', { name: username });
  if (checkError) throw friendly(checkError.message);
  if (!available) throw new AuthMessage('That username is taken. Try another.');

  const { data, error } = await client.auth.signUp({
    email: email.trim(),
    password,
    options: { data: { username } },
  });
  if (error) throw friendly(error.message);
  return Boolean(data.session);
}

export async function signIn(email: string, password: string) {
  const client = requireBackend();
  const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw friendly(error.message);
}

/** Signs out on this phone. Your workouts stay on the phone. */
export async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut({ scope: 'local' });
}

/** Deletes your account and everything backed up with it. Workouts on this phone stay. */
export async function deleteAccount() {
  const client = requireBackend();
  const { error } = await client.rpc('delete_my_account');
  if (error) throw friendly(error.message);
  await client.auth.signOut({ scope: 'local' });
}

/** Turns Supabase's error text into something friendlier. */
function friendly(message: string) {
  const m = message.toLowerCase();
  if (m.includes('invalid login')) return new AuthMessage('Wrong email or password.');
  if (m.includes('already registered')) return new AuthMessage('There’s already an account with that email. Try signing in.');
  if (m.includes('email not confirmed')) return new AuthMessage('Confirm your email first. Check your inbox for the link.');
  if (m.includes('valid email') || m.includes('invalid email')) return new AuthMessage('That email doesn’t look right.');
  if (m.includes('network') || m.includes('fetch')) return new AuthMessage('Couldn’t reach the server. Check your connection.');
  if (m.includes('password should be at least')) return new AuthMessage(`Use a password with at least ${MIN_PASSWORD_LENGTH} characters.`);
  if (m.includes('database error saving new user')) return new AuthMessage('That username was just taken. Try another.');
  return new AuthMessage(message);
}
