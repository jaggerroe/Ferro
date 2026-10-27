import { EXERCISES, type ExerciseKind } from '@/data/exercises';
import { prFor, type NewPR, type Session } from '@/lib/progress';
import { supabase } from '@/lib/supabase';

/**
 * Friends: finding people, requests, and the feed of friends' workouts.
 *
 * Unlike the rest of the app, this data isn't on the phone. It's read live
 * from the backend each time, because it's other people's data. Every call
 * goes through a database function in supabase/schema.sql, which checks
 * the rules (e.g. only the person who got a request can accept it).
 *
 * All of these need you to be signed in; they throw an Error with a
 * plain-English message if something goes wrong.
 */

// ---- people & requests --------------------------------------------------------

/** Where you stand with someone. */
export type Relationship = 'none' | 'outgoing' | 'incoming' | 'friends';

export type FoundUser = { id: string; username: string; relationship: Relationship };

export type FriendEntry = {
  id: string;
  username: string;
  /** 'incoming' = they asked you; 'outgoing' = you asked them. */
  status: Exclude<Relationship, 'none'>;
  /** When you became friends, or when the request was sent. */
  since: string;
};

/** People whose username starts with `query`. Up to 20, exact match first. */
export async function searchUsers(query: string): Promise<FoundUser[]> {
  if (!query.trim()) return [];
  return (await call<FoundUser[]>('search_users', { q: query })) ?? [];
}

/** Your Friends tab list: requests to you, then friends, then requests you sent. */
export async function getMyFriends(): Promise<FriendEntry[]> {
  return (await call<FriendEntry[]>('my_friends')) ?? [];
}

/**
 * Sends a friend request. If they'd already sent you one, this accepts it.
 * Returns 'friends' if you're now friends, 'requested' if it's waiting on them.
 */
export async function sendFriendRequest(userId: string): Promise<'requested' | 'friends'> {
  return call<'requested' | 'friends'>('send_friend_request', { other: userId });
}

export async function acceptFriendRequest(userId: string): Promise<void> {
  await call('accept_friend_request', { other: userId });
}

/** Declines a request, cancels one you sent, or unfriends. */
export async function removeFriend(userId: string): Promise<void> {
  await call('remove_friend', { other: userId });
}

// ---- feed ------------------------------------------------------------------------

export type FeedExercise = {
  exerciseId: string;
  name: string;
  kind: ExerciseKind;
  /** This workout's numbers for the exercise, same shape as on the Progress tab. */
  session: Session;
  /** The record they broke with it, if any. */
  pr: NewPR | null;
};

export type FeedWorkout = {
  id: string;
  userId: string;
  username: string;
  name: string | null;
  startedAt: number;
  finishedAt: number;
  sets: number;
  /** Total lb × reps (stored in lb; show with formatWeightRounded). */
  volume: number;
  exercises: FeedExercise[];
  prs: NewPR[];
};

/** What the friend_feed database function sends back for each exercise. */
type RawFeedExercise = {
  exercise_id: string;
  custom: { name: string; kind: string; muscle: string } | null;
  sets: number;
  max_weight: number;
  max_weight_reps: number | null;
  best_e1rm: number;
  best_e1rm_set: { weight: number; reps: number } | null;
  max_reps: number;
  total_reps: number;
  volume: number;
  total_distance_m: number;
  total_duration_sec: number;
  prev: {
    max_weight: number;
    best_e1rm: number;
    max_reps: number;
    total_distance_m: number;
    total_duration_sec: number;
  } | null;
};

type RawFeedWorkout = {
  workout_id: string;
  user_id: string;
  username: string;
  name: string | null;
  started_at: number;
  finished_at: number;
  set_count: number;
  volume: number;
  exercises: RawFeedExercise[];
};

const builtInById = new Map(EXERCISES.map((e) => [e.id, e]));

/**
 * Friends' finished workouts, newest first, 20 at a time. For the next page,
 * pass the `finishedAt` of the last workout you're showing.
 */
export async function getFriendFeed(olderThan?: number): Promise<FeedWorkout[]> {
  const rows = await call<RawFeedWorkout[]>('friend_feed', { older_than: olderThan ?? null, max_rows: 20 });
  return (rows ?? []).map(toFeedWorkout);
}

function toFeedWorkout(row: RawFeedWorkout): FeedWorkout {
  const exercises = row.exercises.map((raw): FeedExercise => {
    // Built-in exercise names live in the app; custom ones come from the friend's account.
    const builtIn = builtInById.get(raw.exercise_id);
    const name = builtIn?.name ?? raw.custom?.name ?? 'Unknown exercise';
    const kind = builtIn?.kind ?? (raw.custom?.kind as ExerciseKind | undefined) ?? 'strength';

    const session: Session = {
      workoutId: row.workout_id,
      startedAt: row.started_at,
      sets: raw.sets,
      maxWeight: raw.max_weight,
      maxWeightSet: raw.max_weight_reps != null ? { weight: raw.max_weight, reps: raw.max_weight_reps } : null,
      bestE1rm: raw.best_e1rm,
      bestE1rmSet: raw.best_e1rm_set,
      maxReps: raw.max_reps,
      totalReps: raw.total_reps,
      volume: raw.volume,
      maxDistanceM: 0, // not needed for the feed
      totalDistanceM: raw.total_distance_m,
      totalDurationSec: raw.total_duration_sec,
    };

    // No earlier session means it's their first time: not a PR (same as yours).
    const pr = raw.prev
      ? prFor(raw.exercise_id, kind, session, {
          maxWeight: raw.prev.max_weight,
          bestE1rm: raw.prev.best_e1rm,
          maxReps: raw.prev.max_reps,
          totalDistanceM: raw.prev.total_distance_m,
          totalDurationSec: raw.prev.total_duration_sec,
        })
      : null;

    return { exerciseId: raw.exercise_id, name, kind, session, pr };
  });

  return {
    id: row.workout_id,
    userId: row.user_id,
    username: row.username,
    name: row.name,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    sets: row.set_count,
    volume: row.volume,
    exercises,
    prs: exercises.flatMap((e) => (e.pr ? [e.pr] : [])),
  };
}

// ---- plumbing -------------------------------------------------------------------

/** Calls a database function and turns errors into readable messages. */
async function call<T = unknown>(fn: string, args?: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Accounts aren’t set up yet.');
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    if (/network|fetch/i.test(error.message)) throw new Error('Couldn’t reach the server. Check your connection.');
    if (/could not find the function|schema cache/i.test(error.message))
      throw new Error('The Friends backend is missing. Run supabase/schema.sql in Supabase.');
    // Messages raised in schema.sql (like "You can't add yourself") are already friendly.
    throw new Error(error.message);
  }
  return data as T;
}
