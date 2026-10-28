import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, StyleSheet, TextInput, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Chip } from '@/components/chip';
import { PlaceholderCard } from '@/components/placeholder-card';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSession } from '@/lib/auth';
import {
  acceptFriendRequest,
  FEED_PAGE_SIZE,
  getFriendFeed,
  getMyFriends,
  removeFriend,
  searchUsers,
  sendFriendRequest,
  type FeedWorkout,
  type FoundUser,
  type FriendEntry,
} from '@/lib/friends';
import { dayLabel, shortDuration, timeLabel, volumeLabel } from '@/lib/history';
import { useSettings } from '@/lib/settings';

/**
 * Friends tab. Two views:
 * - Feed: your friends' finished workouts, newest first, with their PRs.
 * - Friends: find people by username, answer requests, manage your list.
 *
 * Everything here comes from the internet (it's other people's data), so it
 * re-loads whenever you open the tab, and you can pull down to refresh.
 * You need to be signed in; the backend rules are in supabase/schema.sql.
 */

type Mode = 'feed' | 'friends';

/** How many exercises a feed card lists before "+ N more". */
const MAX_EXERCISES_SHOWN = 4;

export default function FriendsScreen() {
  const session = useSession();

  // Still checking whether you're signed in.
  if (session === undefined) return <Screen title="Friends" />;

  if (session === null) {
    return (
      <Screen title="Friends">
        <PlaceholderCard
          title="Train with your crew"
          body="Sign in to add friends by username, see their workouts, and catch their PRs."
        />
        <PrimaryButton label="Sign in or create account" onPress={() => router.push('/account')} />
      </Screen>
    );
  }

  // `key` gives each account a fresh screen, so signing in as someone else
  // never shows the previous account's friends.
  return <SignedInFriends key={session.user.id} />;
}

function SignedInFriends() {
  useSettings(); // re-draw if you switch lb/kg
  const [mode, setMode] = useState<Mode>('feed');
  const [friends, setFriends] = useState<FriendEntry[] | undefined>(undefined);
  const [feed, setFeed] = useState<FeedWorkout[] | undefined>(undefined);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Loads your friends list and the first page of the feed. */
  const load = useCallback(async () => {
    try {
      const [list, page] = await Promise.all([getMyFriends(), getFriendFeed()]);
      setFriends(list);
      setFeed(page);
      setHasMore(page.length === FEED_PAGE_SIZE);
      setError(null);
    } catch (err) {
      setError(messageOf(err));
    }
  }, []);

  // Re-load every time you switch to this tab, so new requests and workouts show up.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function loadMore() {
    if (!feed || feed.length === 0 || loadingMore) return;
    setLoadingMore(true);
    try {
      const older = await getFriendFeed(feed[feed.length - 1].finishedAt);
      setFeed([...feed, ...older]);
      setHasMore(older.length === FEED_PAGE_SIZE);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setLoadingMore(false);
    }
  }

  const incoming = friends?.filter((f) => f.status === 'incoming') ?? [];
  const accepted = friends?.filter((f) => f.status === 'friends') ?? [];
  const outgoing = friends?.filter((f) => f.status === 'outgoing') ?? [];

  return (
    <Screen
      title="Friends"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      <View style={styles.switcher}>
        <Chip label="Feed" selected={mode === 'feed'} onPress={() => setMode('feed')} />
        <Chip
          label={incoming.length > 0 ? `Friends · ${incoming.length} new` : 'Friends'}
          selected={mode === 'friends'}
          onPress={() => setMode('friends')}
        />
      </View>

      {error ? (
        <ThemedText type="smallBold" themeColor="danger">
          {error} Pull down to try again.
        </ThemedText>
      ) : null}

      {error && friends === undefined ? null : mode === 'feed' ? (
        <FeedView
          feed={feed}
          hasFriends={accepted.length > 0}
          hasMore={hasMore}
          loadingMore={loadingMore}
          onLoadMore={loadMore}
          onFindFriends={() => setMode('friends')}
        />
      ) : (
        <FriendsView
          incoming={incoming}
          accepted={accepted}
          outgoing={outgoing}
          loaded={friends !== undefined}
          onChanged={load}
          onError={setError}
        />
      )}
    </Screen>
  );
}

// ---- Feed -----------------------------------------------------------------------

function FeedView({
  feed,
  hasFriends,
  hasMore,
  loadingMore,
  onLoadMore,
  onFindFriends,
}: {
  feed: FeedWorkout[] | undefined;
  hasFriends: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onFindFriends: () => void;
}) {
  if (feed === undefined) return <ActivityIndicator style={styles.spinner} />;

  if (feed.length === 0) {
    return (
      <>
        <PlaceholderCard
          title={hasFriends ? 'Nothing here yet' : 'No friends yet'}
          body={
            hasFriends
              ? 'When your friends finish a workout, it shows up here with any PRs they hit.'
              : 'Add friends by their username and their finished workouts show up here.'
          }
        />
        {hasFriends ? null : <PrimaryButton label="Find friends" onPress={onFindFriends} />}
      </>
    );
  }

  return (
    <>
      {feed.map((item) => (
        <FeedCard key={item.id} item={item} />
      ))}
      {hasMore ? (
        <PlainButton
          label={loadingMore ? 'Loading…' : 'Show older workouts'}
          onPress={onLoadMore}
          disabled={loadingMore}
        />
      ) : null}
    </>
  );
}

function FeedCard({ item }: { item: FeedWorkout }) {
  const theme = useTheme();
  const meta = [
    shortDuration((item.finishedAt - item.startedAt) / 1000),
    `${item.sets} ${item.sets === 1 ? 'set' : 'sets'}`,
    volumeLabel(item.volume),
  ].filter(Boolean);
  const shown = item.exercises.slice(0, MAX_EXERCISES_SHOWN);
  const hidden = item.exercises.length - shown.length;
  const nameOf = (exerciseId: string) => item.exercises.find((e) => e.exerciseId === exerciseId)?.name ?? '';

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.cardHeader}>
        <Avatar size={36} initial={item.username.charAt(0).toUpperCase()} />
        <View style={styles.flex}>
          <ThemedText type="smallBold" numberOfLines={1}>
            {item.username}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {dayLabel(item.finishedAt)} · {timeLabel(item.finishedAt)}
          </ThemedText>
        </View>
      </View>

      <ThemedText style={styles.cardTitle} numberOfLines={1}>
        {item.name || 'Workout'}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {meta.join('  ·  ')}
      </ThemedText>

      {item.prs.length > 0 ? (
        <View style={styles.prList}>
          {item.prs.map((pr) => (
            <View key={pr.exerciseId} style={[styles.pr, { backgroundColor: theme.backgroundSelected }]}>
              <ThemedText type="smallBold" themeColor="accent">
                PR
              </ThemedText>
              <ThemedText type="small" style={styles.flex}>
                <ThemedText type="smallBold">{nameOf(pr.exerciseId)}</ThemedText>
                {'  '}
                {pr.label} · {pr.value}
              </ThemedText>
            </View>
          ))}
        </View>
      ) : null}

      <View style={[styles.exerciseList, { borderTopColor: theme.backgroundSelected }]}>
        {shown.map((e) => (
          <ThemedText key={e.exerciseId} type="small" numberOfLines={1}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              {e.session.sets} ×{' '}
            </ThemedText>
            {e.name}
          </ThemedText>
        ))}
        {hidden > 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            + {hidden} more
          </ThemedText>
        ) : null}
      </View>
    </ThemedView>
  );
}

// ---- Friends list, requests and search --------------------------------------------

function FriendsView({
  incoming,
  accepted,
  outgoing,
  loaded,
  onChanged,
  onError,
}: {
  incoming: FriendEntry[];
  accepted: FriendEntry[];
  outgoing: FriendEntry[];
  loaded: boolean;
  onChanged: () => Promise<void>;
  onError: (message: string | null) => void;
}) {
  // Which person's button is working right now (so it can't be double-tapped).
  const [busyId, setBusyId] = useState<string | null>(null);

  async function run(userId: string, action: () => Promise<unknown>) {
    setBusyId(userId);
    try {
      await action();
      onError(null);
      await onChanged();
    } catch (err) {
      onError(messageOf(err));
    } finally {
      setBusyId(null);
    }
  }

  function confirmRemove(friend: FriendEntry) {
    Alert.alert(`Remove ${friend.username}?`, 'You’ll stop seeing each other’s workouts.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => run(friend.id, () => removeFriend(friend.id)) },
    ]);
  }

  return (
    <>
      <FindPeople onChanged={onChanged} onError={onError} />

      {incoming.length > 0 ? (
        <Section title="Requests">
          {incoming.map((f) => (
            <PersonRow key={f.id} username={f.username} detail="Wants to be friends">
              <PlainButton
                label="Decline"
                disabled={busyId === f.id}
                onPress={() => run(f.id, () => removeFriend(f.id))}
              />
              <SmallPrimaryButton
                label="Accept"
                disabled={busyId === f.id}
                onPress={() => run(f.id, () => acceptFriendRequest(f.id))}
              />
            </PersonRow>
          ))}
        </Section>
      ) : null}

      <Section title={accepted.length > 0 ? `Friends (${accepted.length})` : 'Friends'}>
        {!loaded ? (
          <ActivityIndicator style={styles.spinner} />
        ) : accepted.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            No friends yet. Search for someone’s username above.
          </ThemedText>
        ) : (
          accepted.map((f) => (
            <PersonRow key={f.id} username={f.username} detail={`Friends since ${sinceLabel(f.since)}`}>
              <PlainButton label="Remove" disabled={busyId === f.id} onPress={() => confirmRemove(f)} />
            </PersonRow>
          ))
        )}
      </Section>

      {outgoing.length > 0 ? (
        <Section title="Sent">
          {outgoing.map((f) => (
            <PersonRow key={f.id} username={f.username} detail="Waiting for them to accept">
              <PlainButton
                label="Cancel"
                disabled={busyId === f.id}
                onPress={() => run(f.id, () => removeFriend(f.id))}
              />
            </PersonRow>
          ))}
        </Section>
      ) : null}
    </>
  );
}

/** Search box + results, each with the right button for where you stand with them. */
function FindPeople({
  onChanged,
  onError,
}: {
  onChanged: () => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const theme = useTheme();
  const [query, setQuery] = useState('');
  // Results are saved with the search they answer, so old results never show for new text.
  const [found, setFound] = useState<{ query: string; users: FoundUser[] } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Search a moment after you stop typing, instead of on every letter.
  const q = query.trim().toLowerCase();
  const results = q && found?.query === q ? found.users : null;

  useEffect(() => {
    if (!q) return;
    let alive = true;
    const timer = setTimeout(() => {
      searchUsers(q)
        .then((users) => alive && setFound({ query: q, users }))
        .catch((err) => alive && onError(messageOf(err)));
    }, 300);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [q, onError]);

  /** Updates one result's button right away, without searching again. */
  function setRelationship(userId: string, relationship: FoundUser['relationship']) {
    setFound((prev) =>
      prev ? { ...prev, users: prev.users.map((u) => (u.id === userId ? { ...u, relationship } : u)) } : prev,
    );
  }

  async function add(user: FoundUser) {
    setBusyId(user.id);
    try {
      const result = await sendFriendRequest(user.id);
      setRelationship(user.id, result === 'friends' ? 'friends' : 'outgoing');
      onError(null);
      await onChanged();
    } catch (err) {
      onError(messageOf(err));
    } finally {
      setBusyId(null);
    }
  }

  async function accept(user: FoundUser) {
    setBusyId(user.id);
    try {
      await acceptFriendRequest(user.id);
      setRelationship(user.id, 'friends');
      onError(null);
      await onChanged();
    } catch (err) {
      onError(messageOf(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <View style={styles.search}>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Find people by username"
        placeholderTextColor={theme.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={20}
        returnKeyType="search"
        clearButtonMode="while-editing"
        style={[styles.input, { backgroundColor: theme.backgroundElement, color: theme.text }]}
      />

      {results === null ? null : results.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          No one with a username starting “{q}”.
        </ThemedText>
      ) : (
        <ThemedView type="backgroundElement" style={styles.resultsCard}>
          {results.map((user) => (
            <PersonRow key={user.id} username={user.username}>
              {user.relationship === 'none' ? (
                <SmallPrimaryButton label="Add" disabled={busyId === user.id} onPress={() => add(user)} />
              ) : user.relationship === 'incoming' ? (
                <SmallPrimaryButton label="Accept" disabled={busyId === user.id} onPress={() => accept(user)} />
              ) : (
                <ThemedText type="smallBold" themeColor="textSecondary">
                  {user.relationship === 'friends' ? 'Friends' : 'Requested'}
                </ThemedText>
              )}
            </PersonRow>
          ))}
        </ThemedView>
      )}
    </View>
  );
}

// ---- small building blocks -------------------------------------------------------

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText type="smallBold" themeColor="accent" style={styles.sectionTitle}>
        {title}
      </ThemedText>
      <ThemedView type="backgroundElement" style={styles.resultsCard}>
        {children}
      </ThemedView>
    </View>
  );
}

/** Avatar, username and an optional line under it, with buttons on the right. */
function PersonRow({ username, detail, children }: { username: string; detail?: string; children?: ReactNode }) {
  return (
    <View style={styles.person}>
      <Avatar size={36} initial={username.charAt(0).toUpperCase()} />
      <View style={styles.flex}>
        <ThemedText type="smallBold" numberOfLines={1}>
          {username}
        </ThemedText>
        {detail ? (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {detail}
          </ThemedText>
        ) : null}
      </View>
      <View style={styles.actions}>{children}</View>
    </View>
  );
}

function PrimaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.bigButton, { backgroundColor: theme.accent, opacity: pressed ? 0.8 : 1 }]}>
      <ThemedText style={[styles.bigButtonLabel, { color: theme.onAccent }]}>{label}</ThemedText>
    </Pressable>
  );
}

function SmallPrimaryButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.smallButton,
        { backgroundColor: theme.accent, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 },
      ]}>
      <ThemedText type="smallBold" style={{ color: theme.onAccent }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

function PlainButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.smallButton,
        { backgroundColor: theme.backgroundSelected, opacity: disabled ? 0.5 : pressed ? 0.7 : 1 },
      ]}>
      <ThemedText type="smallBold">{label}</ThemedText>
    </Pressable>
  );
}

// ---- helpers ----------------------------------------------------------------------

function messageOf(err: unknown) {
  return err instanceof Error ? err.message : 'Something went wrong.';
}

/** "Oct 27" (adds the year if it isn't this year). */
function sinceLabel(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}),
  });
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  switcher: { flexDirection: 'row', gap: Spacing.two },
  spinner: { marginVertical: Spacing.four },

  card: { borderRadius: 16, padding: Spacing.three, gap: 2 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginBottom: Spacing.two },
  cardTitle: { fontSize: 17, lineHeight: 22, fontWeight: 700 },
  prList: { gap: Spacing.one, marginTop: Spacing.two },
  pr: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: 10,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  exerciseList: {
    marginTop: Spacing.two,
    paddingTop: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 2,
  },

  search: { gap: Spacing.two },
  input: { borderRadius: 12, paddingHorizontal: Spacing.three, paddingVertical: 12, fontSize: 16 },
  resultsCard: { borderRadius: 16, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
  section: { gap: Spacing.two },
  sectionTitle: { textTransform: 'uppercase', letterSpacing: 1, fontSize: 12, marginTop: Spacing.two },
  person: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.two },
  actions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },

  smallButton: { borderRadius: 999, paddingHorizontal: Spacing.three, paddingVertical: 6 },
  bigButton: {
    borderRadius: 14,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    minHeight: 54,
    justifyContent: 'center',
  },
  bigButtonLabel: { fontSize: 17, fontWeight: 800 },
});
