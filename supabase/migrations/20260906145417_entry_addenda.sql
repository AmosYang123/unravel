-- "Add something" appends to an entry without ever rewriting what was first
-- written, so addenda need their own home instead of being encoded inline in
-- `body` behind a text marker that then leaks into previews, the export and
-- the advice prompt.
--
-- Additive only. Nullable, so rows written before this migration keep reading
-- and writing exactly as they did.

alter table public.entries add column if not exists addenda jsonb;

-- RLS is unchanged on purpose: entries_own is `for all` and scoped to the row
-- (user_id = auth.uid()), so it already covers this column too.
