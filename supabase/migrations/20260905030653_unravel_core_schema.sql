-- Core Unravel schema, reconstructed from src/integrations/supabase/types.ts
-- when the app moved off the Lovable-managed project onto its own.

do $$ begin
  create type public.app_role as enum ('admin', 'user');
exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  theme text not null default 'linen',
  display_font text not null default 'fraunces',
  body_font text not null default 'karla',
  passcode text not null default '',
  lock_enabled boolean not null default false,
  insights_enabled boolean not null default true,
  ai_suggestions_enabled boolean not null default true,
  show_mood_in_history boolean not null default true,
  discreet_notifications boolean not null default false,
  music_artists text[] not null default '{}',
  music_tastes text[] not null default '{}',
  reminder_mode text not null default 'manual',
  reminder_time text not null default '20:00',
  reminder_days integer[] not null default '{}',
  reminder_email_enabled boolean not null default false,
  last_reminder_sent_at timestamptz,
  timezone text not null default 'UTC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null,
  mood integer not null default 3,
  energy integer not null default 3,
  feelings text[] not null default '{}',
  title text,
  body text,
  bullets text[],
  gratitude text[],
  prompt text,
  breathed boolean not null default false,
  song_id text,
  audio_path text,
  audio_seconds integer,
  transcript text,
  transcript_status text not null default 'none',
  transcript_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists entries_user_created_idx
  on public.entries (user_id, created_at desc);

create table if not exists public.article_recs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null,
  title text not null,
  url text not null,
  source text,
  summary text,
  why text,
  note text,
  minutes integer,
  created_at timestamptz not null default now()
);

create index if not exists article_recs_user_created_idx
  on public.article_recs (user_id, created_at desc);

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

-- Service-role only; no user-facing policies, so the scheduler owns it.
create table if not exists public.reminder_locks (
  name text primary key,
  leased_until timestamptz not null,
  paused_reason text,
  updated_at timestamptz not null default now()
);

alter table public.profiles       enable row level security;
alter table public.entries        enable row level security;
alter table public.article_recs   enable row level security;
alter table public.user_roles     enable row level security;
alter table public.reminder_locks enable row level security;

-- Owner-only access. Roles are readable by their owner but never writable by
-- them, so a user cannot grant themselves admin.
drop policy if exists profiles_own on public.profiles;
create policy profiles_own on public.profiles
  for all to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists entries_own on public.entries;
create policy entries_own on public.entries
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists article_recs_own on public.article_recs;
create policy article_recs_own on public.article_recs
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists user_roles_read_own on public.user_roles;
create policy user_roles_read_own on public.user_roles
  for select to authenticated
  using (user_id = auth.uid());

-- Definer so it can read user_roles past that read-only policy.
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
     where user_id = _user_id and role = _role
  );
$$;

revoke all on function public.has_role(uuid, public.app_role) from public;
grant execute on function public.has_role(uuid, public.app_role) to authenticated;

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end; $$;

drop trigger if exists entries_touch_updated_at on public.entries;
create trigger entries_touch_updated_at before update on public.entries
  for each row execute function public.touch_updated_at();

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at before update on public.profiles
  for each row execute function public.touch_updated_at();
