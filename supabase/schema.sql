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
