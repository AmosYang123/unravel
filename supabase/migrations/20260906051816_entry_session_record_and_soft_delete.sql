-- What a session actually produced, kept on the entry: the pre-writing slider
-- answers, the support plan and the songs the user was really shown. Plus a
-- quiet bookmark and a soft delete, so removing an entry is recoverable.
--
-- Additive only. Every column is nullable, so rows written before this
-- migration keep reading and writing exactly as they did.

alter table public.entries add column if not exists intent     text[];
alter table public.entries add column if not exists advice     jsonb;
alter table public.entries add column if not exists songs      jsonb;
alter table public.entries add column if not exists kept       boolean;
alter table public.entries add column if not exists deleted_at timestamptz;

-- The common read is one person's live journal, newest first.
create index if not exists entries_user_created_live_idx
  on public.entries (user_id, created_at desc)
  where deleted_at is null;

-- RLS is unchanged on purpose: entries_own is `for all` and scoped to the row
-- (user_id = auth.uid()), so it already covers these columns. Adding another
-- policy here would only duplicate it.
