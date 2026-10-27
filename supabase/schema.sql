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

drop policy if exists "Signed-in users can see profiles" on public.profiles;
create policy "Signed-in users can see profiles" on public.profiles
  for select to authenticated using (true);

drop policy if exists "You can update your own profile" on public.profiles;
create policy "You can update your own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

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
  id          text primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null,
  muscle      text not null,
  secondary   text not null default '[]',
  equipment   text not null,
  kind        text not null,
  created_at  bigint not null
);

create table if not exists public.workouts (
  id           text primary key,
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name         text,
  started_at   bigint not null,
  finished_at  bigint,
  notes        text
);

create table if not exists public.workout_exercises (
  id           text primary key,
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  workout_id   text not null,
  exercise_id  text not null,
  position     integer not null
);

create table if not exists public.sets (
  id                   text primary key,
  user_id              uuid not null default auth.uid() references auth.users (id) on delete cascade,
  workout_exercise_id  text not null,
  position             integer not null,
  weight               double precision,
  reps                 integer,
  duration_sec         integer,
  distance_m           double precision,
  completed            integer not null default 0
);

create table if not exists public.routines (
  id            text primary key,
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name          text not null,
  created_at    bigint not null,
  last_used_at  bigint
);

create table if not exists public.routine_exercises (
  id           text primary key,
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  routine_id   text not null,
  exercise_id  text not null,
  position     integer not null,
  sets         integer not null default 3
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
      'using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    execute format('create index if not exists %I on public.%I (user_id)', t || '_user_id_idx', t);
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
create or replace function public.search_users(q text)
returns table (id uuid, username text, relationship text)
language sql
stable
set search_path = ''
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
  where term.t <> ''
    and p.id <> (select auth.uid())
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
      where w.id = workout_exercises.workout_id and w.finished_at is not null
    )
  );

drop policy if exists "Friends can see sets in finished workouts" on public.sets;
create policy "Friends can see sets in finished workouts" on public.sets
  for select to authenticated
  using (
    public.is_friend(user_id)
    and exists (
      select 1 from public.workout_exercises we
      join public.workouts w on w.id = we.workout_id
      where we.id = sets.workout_exercise_id and w.finished_at is not null
    )
  );

drop policy if exists "Friends can see custom exercises" on public.custom_exercises;
create policy "Friends can see custom exercises" on public.custom_exercises
  for select to authenticated
  using (public.is_friend(user_id));

-- Speed up the lookups the feed and the policies above do.
create index if not exists workouts_user_finished_idx on public.workouts (user_id, finished_at);
create index if not exists workout_exercises_workout_idx on public.workout_exercises (workout_id);
create index if not exists workout_exercises_user_exercise_idx on public.workout_exercises (user_id, exercise_id);
create index if not exists sets_workout_exercise_idx on public.sets (workout_exercise_id);

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
    join public.workout_exercises we on we.workout_id = w.id
    join public.sets s on s.workout_exercise_id = we.id and s.completed = 1
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
        where we2.workout_id in (select page.id from page)
      )
    group by w.user_id, w.id, w.started_at, we.exercise_id
  ),
  current_sessions as (
    select s.*, prev.p as prev
    from sessions s
    join page on page.id = s.workout_id
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
  left join current_sessions c on c.workout_id = page.id
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
    'remove_friend(uuid)', 'search_users(text)', 'my_friends()', 'friend_feed(bigint, integer)'
  ]
  loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end;
$$;
