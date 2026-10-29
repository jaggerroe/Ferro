-- Ferro backend setup.
-- Paste this whole file into Supabase → SQL Editor → New query, then press Run.
-- It's safe to run again: it only adds what's missing.
--
-- How it fits together: your phone stays the main copy of your data. When
-- you're signed in, the app backs everything up to these tables. Row Level
-- Security (RLS) means each person can only ever read or change their own
-- rows, even though every copy of the app talks to the same database.

-- ---------------------------------------------------------------------------
-- Profiles: one per account, holding the public username.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  username    text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  created_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Who can see which profiles is set in the Friends section further down
-- (you, plus people you're connected to), because it needs the friendships
-- table. This used to let every signed-in user list every username.
drop policy if exists "Signed-in users can see profiles" on public.profiles;

drop policy if exists "You can update your own profile" on public.profiles;
create policy "You can update your own profile" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Make the profile automatically when someone signs up, using the username
-- the app sends along with the sign-up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, username)
  values (new.id, lower(new.raw_user_meta_data ->> 'username'));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Lets the sign-up screen check a username before creating the account.
create or replace function public.username_available(name text)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select not exists (select 1 from public.profiles where username = lower(name));
$$;

grant execute on function public.username_available(text) to anon, authenticated;

-- "Delete account" in the app. Deleting the auth user also deletes all of
-- their rows below (on delete cascade). The App Store requires this option.
create or replace function public.delete_my_account()
returns void
language sql
security definer set search_path = ''
as $$
  delete from auth.users where id = auth.uid();
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ---------------------------------------------------------------------------
-- Backed-up data. Same columns as the tables on the phone, plus user_id.
-- ---------------------------------------------------------------------------
create table if not exists public.custom_exercises (
  id          text not null,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null,
  muscle      text not null,
  secondary   text not null default '[]',
  equipment   text not null,
  kind        text not null,
  created_at  bigint not null,
  primary key (user_id, id)
);

create table if not exists public.workouts (
  id           text not null,
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name         text,
  started_at   bigint not null,
  finished_at  bigint,
  notes        text,
  primary key (user_id, id)
);

create table if not exists public.workout_exercises (
  id           text not null,
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  workout_id   text not null,
  exercise_id  text not null,
  position     integer not null,
  primary key (user_id, id)
);

create table if not exists public.sets (
  id                   text not null,
  user_id              uuid not null default auth.uid() references auth.users (id) on delete cascade,
  workout_exercise_id  text not null,
  position             integer not null,
  weight               double precision,
  reps                 integer,
  duration_sec         integer,
  distance_m           double precision,
  completed            integer not null default 0,
  primary key (user_id, id)
);

create table if not exists public.routines (
  id            text not null,
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name          text not null,
  created_at    bigint not null,
  last_used_at  bigint,
  primary key (user_id, id)
);

create table if not exists public.routine_exercises (
  id           text not null,
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  routine_id   text not null,
  exercise_id  text not null,
  position     integer not null,
  sets         integer not null default 3,
  primary key (user_id, id)
);

create table if not exists public.user_settings (
  user_id  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key      text not null,
  value    text not null,
  primary key (user_id, key)
);

-- Everyone can only see and change their own rows.
do $$
declare
  t text;
begin
  foreach t in array array[
    'custom_exercises', 'workouts', 'workout_exercises', 'sets',
    'routines', 'routine_exercises', 'user_settings'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "Own rows only" on public.%I', t);
    execute format(
      'create policy "Own rows only" on public.%I for all to authenticated '
      -- "(select auth.uid())" instead of "auth.uid()" makes Postgres work out
      -- who you are once per query instead of once per row (Supabase's advice).
      'using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('create index if not exists %I on public.%I (user_id)', t || '_user_id_idx', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Safety rules for the backed-up data.
-- ---------------------------------------------------------------------------

-- 1. Ids are unique per ACCOUNT, not across everyone. Before, every id had to
--    be unique in the whole database, so if a phone that had backed up one
--    account signed into another and merged, its backups failed for good
--    (those ids were "taken"). Databases set up before this get switched over.
do $$
declare
  t text;
  pk_name text;
  pk_cols text;
begin
  foreach t in array array[
    'custom_exercises', 'workouts', 'workout_exercises', 'sets', 'routines', 'routine_exercises'
  ]
  loop
    select c.conname, string_agg(a.attname, ',' order by a.attname)
      into pk_name, pk_cols
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.conrelid = format('public.%I', t)::regclass and c.contype = 'p'
    group by c.conname;

    if pk_cols = 'id' then
      execute format('alter table public.%I drop constraint %I', t, pk_name);
      execute format('alter table public.%I add primary key (user_id, id)', t);
    end if;
  end loop;
end;
$$;

-- 2. Children must belong to a parent in the SAME account. Without this,
--    someone could add sets that claim to be part of another person's
--    workout, and they'd show up in that workout on friends' feeds.
--    Deleting a workout or routine also deletes what's inside it.
--    "not valid" = enforce for new rows without re-checking old ones.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'workout_exercises_workout_fk') then
    alter table public.workout_exercises add constraint workout_exercises_workout_fk
      foreign key (user_id, workout_id) references public.workouts (user_id, id) on delete cascade not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sets_workout_exercise_fk') then
    alter table public.sets add constraint sets_workout_exercise_fk
      foreign key (user_id, workout_exercise_id) references public.workout_exercises (user_id, id) on delete cascade not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'routine_exercises_routine_fk') then
    alter table public.routine_exercises add constraint routine_exercises_routine_fk
      foreign key (user_id, routine_id) references public.routines (user_id, id) on delete cascade not valid;
  end if;
end;
$$;

-- 3. Sensible limits on what can be saved, so nobody can store a 10 MB
--    workout name (that friends would then download) or a weight of 1e300.
--    Real data from the app is far inside these.
do $$
declare
  rule text[];
begin
  foreach rule slice 1 in array array[
    -- table, rule name, condition
    ['custom_exercises', 'custom_exercises_limits',
      $c$char_length(id) <= 64 and char_length(name) between 1 and 60 and char_length(muscle) <= 40
        and char_length(secondary) <= 500 and char_length(equipment) <= 40
        and kind in ('strength', 'bodyweight', 'cardio')$c$],
    ['workouts', 'workouts_limits',
      $c$char_length(id) <= 64 and char_length(coalesce(name, '')) <= 100
        and char_length(coalesce(notes, '')) <= 2000
        and started_at > 0$c$],
    ['workout_exercises', 'workout_exercises_limits',
      $c$char_length(id) <= 64 and char_length(exercise_id) <= 100 and position between 0 and 100000$c$],
    -- Number caps are far above anything real but cover even a typo the set
    -- boxes allow (7 digits), so a typo can never make backups fail.
    ['sets', 'sets_limits',
      $c$char_length(id) <= 64 and position between 0 and 100000 and completed in (0, 1)
        and (weight is null or weight between 0 and 100000000)
        and (reps is null or reps between 0 and 100000000)
        and (duration_sec is null or duration_sec between 0 and 1000000000)
        and (distance_m is null or distance_m between 0 and 100000000000)$c$],
    ['routines', 'routines_limits',
      $c$char_length(id) <= 64 and char_length(name) between 1 and 100$c$],
    ['routine_exercises', 'routine_exercises_limits',
      $c$char_length(id) <= 64 and char_length(exercise_id) <= 100
        and position between 0 and 100000 and sets between 0 and 1000$c$],
    ['user_settings', 'user_settings_limits',
      $c$char_length(key) <= 50 and char_length(value) <= 500$c$]
  ]
  loop
    if not exists (select 1 from pg_constraint where conname = rule[2]) then
      execute format('alter table public.%I add constraint %I check (%s) not valid', rule[1], rule[2], rule[3]);
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Friends.
--
-- One row per pair of people. Whoever sends the request is the "requester";
-- the other person is the "addressee". The row starts as 'pending' and
-- becomes 'accepted' when the addressee says yes. Declining, cancelling a
-- request, and unfriending all just delete the row.
--
-- The app never writes this table directly. It calls the functions below
-- (send_friend_request etc.), which check the rules. That way nobody can,
-- say, insert an already-accepted friendship with a stranger.
-- ---------------------------------------------------------------------------
create table if not exists public.friendships (
  requester_id  uuid not null references auth.users (id) on delete cascade,
  addressee_id  uuid not null references auth.users (id) on delete cascade,
  status        text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at    timestamptz not null default now(),
  accepted_at   timestamptz,
  primary key (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);

-- Only one row per pair, whichever direction the request went.
create unique index if not exists friendships_pair_idx
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index if not exists friendships_addressee_idx on public.friendships (addressee_id);

alter table public.friendships enable row level security;

-- You can see the requests and friendships you're part of. There are no
-- insert/update/delete policies on purpose: changes go through the functions.
drop policy if exists "You can see your own friendships" on public.friendships;
create policy "You can see your own friendships" on public.friendships
  for select to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));

-- True if you and `other` are accepted friends. Used by the policies below.
-- "security definer" lets it read friendships without tripping over that
-- table's own RLS; it only ever answers about you, so it can't leak anything.
create or replace function public.is_friend(other uuid)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = (select auth.uid()) and f.addressee_id = other)
        or (f.addressee_id = (select auth.uid()) and f.requester_id = other))
  );
$$;

-- Blocking. If either of you blocked the other: no requests, no friendship,
-- and you don't show up in each other's searches. Only the blocker can see
-- the block (the blocked person isn't told).
create table if not exists public.blocks (
  blocker_id  uuid not null references auth.users (id) on delete cascade,
  blocked_id  uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index if not exists blocks_blocked_idx on public.blocks (blocked_id);

alter table public.blocks enable row level security;
drop policy if exists "You can see who you blocked" on public.blocks;
create policy "You can see who you blocked" on public.blocks
  for select to authenticated using (blocker_id = (select auth.uid()));

-- Reports go here for you (the app owner) to review in Supabase's Table
-- Editor. Nobody can read them from the app, not even the person reporting.
-- Apple requires a way to report people in apps where users see each
-- other's content.
create table if not exists public.reports (
  id                 bigint generated always as identity primary key,
  reporter_id        uuid not null references auth.users (id) on delete cascade,
  reported_id        uuid references auth.users (id) on delete set null,
  reported_username  text not null,
  reason             text not null check (char_length(reason) between 1 and 200),
  created_at         timestamptz not null default now(),
  resolved           boolean not null default false
);
alter table public.reports enable row level security;

-- True if a block exists either way between two people. Internal: used by
-- the functions below, not callable from the app.
create or replace function public.blocked_between(a uuid, b uuid)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  );
$$;
revoke execute on function public.blocked_between(uuid, uuid) from public, anon, authenticated;

-- Who can see a profile (username): you, and anyone you have a request or
-- friendship with. Finding new people goes through search_users below, which
-- only returns matches for what you typed, 20 at a time.
drop policy if exists "You can see profiles of people you're connected to" on public.profiles;
create policy "You can see profiles of people you're connected to" on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1 from public.friendships f
      where (f.requester_id = (select auth.uid()) and f.addressee_id = profiles.id)
         or (f.addressee_id = (select auth.uid()) and f.requester_id = profiles.id)
    )
  );

-- Send a request to someone (by their account id, which search_users gives
-- you). If they'd already sent you one, this accepts it instead.
-- Returns 'requested' or 'friends'.
create or replace function public.send_friend_request(other uuid)
returns text
language plpgsql
security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  existing public.friendships;
begin
  if me is null then raise exception 'Not signed in'; end if;
  if other = me then raise exception 'You can''t add yourself'; end if;
  if not exists (select 1 from public.profiles where id = other) then
    raise exception 'That account doesn''t exist';
  end if;
  -- Same message either way, so a blocked person can't tell they were blocked.
  if public.blocked_between(me, other) then
    raise exception 'You can''t send a request to that account';
  end if;

  select * into existing from public.friendships
  where (requester_id = me and addressee_id = other)
     or (requester_id = other and addressee_id = me);

  if found then
    if existing.status = 'accepted' then return 'friends'; end if;
    if existing.requester_id = me then return 'requested'; end if;
    -- They already asked you, so asking them back means yes.
    update public.friendships set status = 'accepted', accepted_at = now()
    where requester_id = other and addressee_id = me;
    return 'friends';
  end if;

  -- Stops anyone spamming requests to everybody.
  if (select count(*) from public.friendships where requester_id = me and status = 'pending') >= 50 then
    raise exception 'You have 50 requests waiting. Cancel some before sending more.';
  end if;

  insert into public.friendships (requester_id, addressee_id) values (me, other);
  return 'requested';
end;
$$;

-- Say yes to a request someone sent you.
create or replace function public.accept_friend_request(other uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  update public.friendships set status = 'accepted', accepted_at = now()
  where requester_id = other and addressee_id = auth.uid() and status = 'pending';
  if not found then raise exception 'That request isn''t there anymore'; end if;
end;
$$;

-- Decline a request, cancel one you sent, or unfriend: all the same thing.
create or replace function public.remove_friend(other uuid)
returns void
language sql
security definer set search_path = ''
as $$
  delete from public.friendships
  where (requester_id = auth.uid() and addressee_id = other)
     or (requester_id = other and addressee_id = auth.uid());
$$;

-- Find people by the start of their username. Also says where you stand
-- with each one: 'none', 'outgoing' (you asked), 'incoming' (they asked)
-- or 'friends'. Exact matches come first.
--
-- It needs at least 3 characters and returns at most 20, so nobody can
-- download the whole user list. People who blocked you (or you blocked)
-- don't show up. "security definer" lets it look through all profiles, which
-- you otherwise can't; it only ever returns id + username.
create or replace function public.search_users(q text)
returns table (id uuid, username text, relationship text)
language sql
stable
security definer set search_path = ''
as $$
  with term as (
    -- Usernames are only a-z, 0-9 and _, so drop anything else. "_" is a
    -- wildcard in LIKE, so escape it to mean a real underscore.
    select regexp_replace(lower(coalesce(q, '')), '[^a-z0-9_]', '', 'g') as t
  )
  select p.id, p.username,
    case
      when f.status = 'accepted' then 'friends'
      when f.requester_id = (select auth.uid()) then 'outgoing'
      when f.addressee_id = (select auth.uid()) then 'incoming'
      else 'none'
    end
  from term, public.profiles p
  left join public.friendships f
    on (f.requester_id = (select auth.uid()) and f.addressee_id = p.id)
    or (f.addressee_id = (select auth.uid()) and f.requester_id = p.id)
  where char_length(term.t) >= 3
    and (select auth.uid()) is not null
    and p.id <> (select auth.uid())
    and not public.blocked_between((select auth.uid()), p.id)
    and p.username like replace(term.t, '_', '\_') || '%'
  order by p.username = term.t desc, p.username
  limit 20;
$$;

-- Everyone on your Friends tab: requests to you first, then friends, then
-- requests you've sent. `since` is when you became friends (or when the
-- request was sent).
create or replace function public.my_friends()
returns table (id uuid, username text, status text, since timestamptz)
language sql
stable
set search_path = ''
as $$
  select p.id, p.username, x.status, coalesce(f.accepted_at, f.created_at)
  from public.friendships f
  cross join lateral (
    select case
      when f.status = 'accepted' then 'friends'
      when f.requester_id = (select auth.uid()) then 'outgoing'
      else 'incoming'
    end as status
  ) x
  join public.profiles p
    on p.id = case when f.requester_id = (select auth.uid()) then f.addressee_id else f.requester_id end
  where (select auth.uid()) in (f.requester_id, f.addressee_id)
  order by case x.status when 'incoming' then 0 when 'friends' then 1 else 2 end, p.username;
$$;

-- Block someone: also removes any friendship or request between you.
create or replace function public.block_user(other uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'Not signed in'; end if;
  if other = me then raise exception 'You can''t block yourself'; end if;
  delete from public.friendships
  where (requester_id = me and addressee_id = other) or (requester_id = other and addressee_id = me);
  insert into public.blocks (blocker_id, blocked_id) values (me, other) on conflict do nothing;
end;
$$;

create or replace function public.unblock_user(other uuid)
returns void
language sql
security definer set search_path = ''
as $$
  delete from public.blocks where blocker_id = auth.uid() and blocked_id = other;
$$;

-- People you've blocked, with usernames (you can't see their profiles anymore,
-- so this reads them for you).
create or replace function public.my_blocked()
returns table (id uuid, username text)
language sql
stable
security definer set search_path = ''
as $$
  select p.id, p.username
  from public.blocks b
  join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = (select auth.uid())
  order by p.username;
$$;

-- Report someone. Saves their username at that moment too, in case they
-- change it or delete their account. Max 20 reports a day per person.
create or replace function public.report_user(other uuid, reason text)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  name text;
begin
  if me is null then raise exception 'Not signed in'; end if;
  select username into name from public.profiles where id = other;
  if name is null then raise exception 'That account doesn''t exist'; end if;
  if (select count(*) from public.reports
      where reporter_id = me and created_at > now() - interval '1 day') >= 20 then
    raise exception 'You''ve sent a lot of reports today. Try again tomorrow.';
  end if;
  insert into public.reports (reporter_id, reported_id, reported_username, reason)
  values (me, other, name, left(coalesce(nullif(trim(reason), ''), 'No reason given'), 200));
end;
$$;

-- ---------------------------------------------------------------------------
-- What friends can see of each other.
--
-- These sit alongside "Own rows only" (Postgres allows a row if ANY policy
-- allows it). Friends can only READ, and only FINISHED workouts plus the
-- exercises and sets inside them, and each other's custom exercises (so the
-- names show up). Routines, settings and a workout in progress stay private.
-- ---------------------------------------------------------------------------
drop policy if exists "Friends can see finished workouts" on public.workouts;
create policy "Friends can see finished workouts" on public.workouts
  for select to authenticated
  using (finished_at is not null and public.is_friend(user_id));

drop policy if exists "Friends can see exercises in finished workouts" on public.workout_exercises;
create policy "Friends can see exercises in finished workouts" on public.workout_exercises
  for select to authenticated
  using (
    public.is_friend(user_id)
    and exists (
      select 1 from public.workouts w
      where w.user_id = workout_exercises.user_id
        and w.id = workout_exercises.workout_id and w.finished_at is not null
    )
  );

drop policy if exists "Friends can see sets in finished workouts" on public.sets;
create policy "Friends can see sets in finished workouts" on public.sets
  for select to authenticated
  using (
    public.is_friend(user_id)
    and exists (
      select 1 from public.workout_exercises we
      join public.workouts w on w.user_id = we.user_id and w.id = we.workout_id
      where we.user_id = sets.user_id
        and we.id = sets.workout_exercise_id and w.finished_at is not null
    )
  );

drop policy if exists "Friends can see custom exercises" on public.custom_exercises;
create policy "Friends can see custom exercises" on public.custom_exercises
  for select to authenticated
  using (public.is_friend(user_id));

-- Speed up the lookups the feed and the policies above do.
create index if not exists workouts_user_finished_idx on public.workouts (user_id, finished_at);
create index if not exists workout_exercises_user_workout_idx on public.workout_exercises (user_id, workout_id);
create index if not exists workout_exercises_user_exercise_idx on public.workout_exercises (user_id, exercise_id);
create index if not exists sets_user_workout_exercise_idx on public.sets (user_id, workout_exercise_id);
-- Older single-column versions of the two indexes above; no longer needed.
drop index if exists public.workout_exercises_workout_idx;
drop index if exists public.sets_workout_exercise_idx;

-- ---------------------------------------------------------------------------
-- The feed: your friends' finished workouts, newest first.
--
-- Each workout comes with an `exercises` list. For every exercise you get
-- that session's numbers and `prev`: the friend's best numbers from all
-- their EARLIER workouts (null if it's their first time). The app compares
-- the two with the same rules it uses for your own PRs, so a friend's PR
-- shows up exactly like yours would.
--
-- This runs with YOUR permissions (no "security definer"), so it can only
-- ever show what the policies above already let you see.
--
-- Paging: pass the oldest finished_at you've shown as `older_than` to get
-- the next page.
-- ---------------------------------------------------------------------------
create or replace function public.friend_feed(older_than bigint default null, max_rows integer default 20)
returns table (
  workout_id   text,
  user_id      uuid,
  username     text,
  name         text,
  started_at   bigint,
  finished_at  bigint,
  set_count    integer,
  volume       double precision,
  exercises    jsonb
)
language sql
stable
set search_path = ''
as $$
  with page as (
    select w.id, w.user_id, w.name, w.started_at, w.finished_at
    from public.workouts w
    where w.finished_at is not null
      and w.user_id <> (select auth.uid())
      and public.is_friend(w.user_id)
      and (older_than is null or w.finished_at < older_than)
    order by w.finished_at desc
    limit least(greatest(coalesce(max_rows, 20), 1), 50)
  ),
  -- Every (workout, exercise) "session" those friends have done of the
  -- exercises on this page, with the same numbers progress.ts works out.
  sessions as (
    select
      w.user_id, w.id as workout_id, w.started_at, we.exercise_id,
      min(we.position) as position,
      count(*)::integer as sets,
      max(coalesce(s.weight, 0)) as max_weight,
      -- Reps of the heaviest set (most reps wins a tie), like the History screen.
      (array_agg(coalesce(s.reps, 0) order by coalesce(s.weight, 0) desc, coalesce(s.reps, 0) desc))[1] as max_weight_reps,
      max(x.e1rm) as best_e1rm,
      (array_agg(jsonb_build_object('weight', coalesce(s.weight, 0), 'reps', coalesce(s.reps, 0))
        order by x.e1rm desc))[1] as best_e1rm_set,
      max(coalesce(s.reps, 0)) as max_reps,
      sum(coalesce(s.reps, 0))::integer as total_reps,
      sum(coalesce(s.weight, 0) * coalesce(s.reps, 0)) as volume,
      sum(coalesce(s.distance_m, 0)) as total_distance_m,
      sum(coalesce(s.duration_sec, 0))::integer as total_duration_sec
    from public.workouts w
    -- Every join also matches user_id: ids are only unique within one account.
    join public.workout_exercises we on we.user_id = w.user_id and we.workout_id = w.id
    join public.sets s on s.user_id = we.user_id and s.workout_exercise_id = we.id and s.completed = 1
    -- Epley est. 1RM, same as estimateOneRepMax() in the app.
    cross join lateral (
      select case
        when coalesce(s.weight, 0) <= 0 or coalesce(s.reps, 0) <= 0 then 0
        when s.reps = 1 then s.weight
        else s.weight * (1 + s.reps / 30.0)
      end as e1rm
    ) x
    where w.finished_at is not null
      and w.user_id in (select page.user_id from page)
      and we.exercise_id in (
        select we2.exercise_id from public.workout_exercises we2
        where (we2.user_id, we2.workout_id) in (select page.user_id, page.id from page)
      )
    group by w.user_id, w.id, w.started_at, we.exercise_id
  ),
  current_sessions as (
    select s.*, prev.p as prev
    from sessions s
    join page on page.user_id = s.user_id and page.id = s.workout_id
    cross join lateral (
      select case when count(*) = 0 then null else jsonb_build_object(
        'max_weight', max(o.max_weight),
        'best_e1rm', max(o.best_e1rm),
        'max_reps', max(o.max_reps),
        'total_distance_m', max(o.total_distance_m),
        'total_duration_sec', max(o.total_duration_sec)
      ) end as p
      from sessions o
      where o.user_id = s.user_id
        and o.exercise_id = s.exercise_id
        and o.started_at < s.started_at
    ) prev
  )
  select
    page.id, page.user_id, pr.username, page.name, page.started_at, page.finished_at,
    coalesce(sum(c.sets), 0)::integer,
    coalesce(sum(c.volume), 0)::double precision,
    coalesce(
      jsonb_agg(jsonb_build_object(
        'exercise_id', c.exercise_id,
        -- Set for custom exercises (built-in names live in the app).
        'custom', case when ce.id is null then null
                  else jsonb_build_object('name', ce.name, 'kind', ce.kind, 'muscle', ce.muscle) end,
        'sets', c.sets,
        'max_weight', c.max_weight,
        -- No "heaviest set" / "best 1RM set" when nothing was lifted (bodyweight, cardio).
        'max_weight_reps', case when c.max_weight > 0 then c.max_weight_reps end,
        'best_e1rm', c.best_e1rm,
        'best_e1rm_set', case when c.best_e1rm > 0 then c.best_e1rm_set end,
        'max_reps', c.max_reps,
        'total_reps', c.total_reps,
        'volume', c.volume,
        'total_distance_m', c.total_distance_m,
        'total_duration_sec', c.total_duration_sec,
        'prev', c.prev
      ) order by c.position) filter (where c.exercise_id is not null),
      '[]'::jsonb
    )
  from page
  join public.profiles pr on pr.id = page.user_id
  left join current_sessions c on c.user_id = page.user_id and c.workout_id = page.id
  left join public.custom_exercises ce on ce.id = c.exercise_id and ce.user_id = page.user_id
  group by page.id, page.user_id, pr.username, page.name, page.started_at, page.finished_at
  order by page.finished_at desc;
$$;

-- Only signed-in users can call the friend functions.
do $$
declare
  f text;
begin
  foreach f in array array[
    'is_friend(uuid)', 'send_friend_request(uuid)', 'accept_friend_request(uuid)',
    'remove_friend(uuid)', 'search_users(text)', 'my_friends()', 'friend_feed(bigint, integer)',
    'block_user(uuid)', 'unblock_user(uuid)', 'my_blocked()', 'report_user(uuid, text)'
  ]
  loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end;
$$;
