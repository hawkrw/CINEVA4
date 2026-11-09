-- CINEVA personal streaming experience
-- Account-owned viewer profiles, progress, follows and release alerts.
-- Existing legacy continue_watching table remains locked and untouched.

create schema if not exists cineva_private;
revoke all on schema cineva_private from public, anon, authenticated;

create table public.viewer_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  slot smallint not null check (slot between 1 and 5),
  name text not null check (char_length(btrim(name)) between 1 and 24),
  avatar_emoji text not null default '🍿',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, slot),
  unique(id, user_id)
);
alter table public.viewer_profiles enable row level security;
create policy "Users can read own viewer profiles" on public.viewer_profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can create own viewer profiles" on public.viewer_profiles for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can update own viewer profiles" on public.viewer_profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users can delete own viewer profiles" on public.viewer_profiles for delete to authenticated using ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.viewer_profiles to authenticated;
revoke all on public.viewer_profiles from anon;

create table public.watch_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null,
  content_type text not null check (content_type in ('movie','series')),
  content_id text not null,
  title text not null,
  poster_url text,
  category text,
  position_seconds integer not null default 0 check (position_seconds >= 0),
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  last_watched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(profile_id, content_type, content_id),
  constraint watch_progress_profile_owner_fk foreign key (profile_id, user_id) references public.viewer_profiles(id, user_id) on delete cascade
);
alter table public.watch_progress enable row level security;
create policy "Users manage own watch progress" on public.watch_progress for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.watch_progress to authenticated;
revoke all on public.watch_progress from anon;
create index watch_progress_user_profile_recent_idx on public.watch_progress(user_id, profile_id, last_watched_at desc);

create table public.series_follows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  series_id bigint not null references public.series(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(user_id, series_id)
);
alter table public.series_follows enable row level security;
create policy "Users manage own series follows" on public.series_follows for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.series_follows to authenticated;
revoke all on public.series_follows from anon;
create index series_follows_series_id_idx on public.series_follows(series_id);

create table public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('new_movie','new_episode','system')),
  title text not null,
  message text not null,
  content_type text,
  content_id text,
  href text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.user_notifications enable row level security;
create policy "Users manage own notifications" on public.user_notifications for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.user_notifications to authenticated;
revoke all on public.user_notifications from anon;
create index user_notifications_user_recent_idx on public.user_notifications(user_id, created_at desc);
create index user_notifications_unread_idx on public.user_notifications(user_id, created_at desc) where read_at is null;

create or replace function cineva_private.notify_followers_new_episode()
returns trigger language plpgsql security definer set search_path = '' as $$
declare series_title text;
begin
  if new.is_active is distinct from true then return new; end if;
  select s.title into series_title from public.series s where s.id = new.series_id;
  insert into public.user_notifications(user_id,event_type,title,message,content_type,content_id,href)
  select f.user_id,'new_episode',coalesce(series_title,'A series you follow') || ' — New episode',
    coalesce(new.title,'A new episode is now available'),'series',new.series_id::text,
    '/watch.html?id=' || new.series_id::text || '&type=series'
  from public.series_follows f where f.series_id = new.series_id on conflict do nothing;
  return new;
end; $$;
revoke all on function cineva_private.notify_followers_new_episode() from public, anon, authenticated;

create or replace function cineva_private.notify_users_new_movie()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.is_active is distinct from true then return new; end if;
  insert into public.user_notifications(user_id,event_type,title,message,content_type,content_id,href)
  select distinct vp.user_id,'new_movie','New on CINEVA: ' || new.title,
    'A new movie has just been added to the library.','movie',new.id::text,
    '/watch.html?id=' || new.id::text || '&type=movie'
  from public.viewer_profiles vp on conflict do nothing;
  return new;
end; $$;
revoke all on function cineva_private.notify_users_new_movie() from public, anon, authenticated;

create trigger cineva_notify_followers_new_episode after insert on public.episodes for each row execute function cineva_private.notify_followers_new_episode();
create trigger cineva_notify_users_new_movie after insert on public.movies for each row execute function cineva_private.notify_users_new_movie();
