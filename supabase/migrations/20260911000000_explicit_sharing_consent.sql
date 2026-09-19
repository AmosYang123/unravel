-- Previously enabled defaults are not evidence of informed permission.
alter table public.profiles add column if not exists ai_consent_version text;
alter table public.profiles alter column ai_suggestions_enabled set default false;
-- This migration has already run in production, so the original blanket clear is
-- narrowed to the rows it was actually aimed at: sharing switched on with no
-- recorded consent version. Re-applying the sequence therefore leaves anyone who
-- has since accepted (`ai_consent_version` set by the client) untouched, while a
-- fresh database — where the column is new and null everywhere — still gets the
-- same reset the first run performed.
update public.profiles set ai_suggestions_enabled = false
 where ai_suggestions_enabled and ai_consent_version is null;

-- Usage counters also belong to the account and must disappear on deletion.
delete from public.rate_limits where user_id not in (select id from auth.users);
-- `add constraint` has no `if not exists`, so drop first the way the policies
-- elsewhere in this repo do; the constraint is recreated identically.
alter table public.rate_limits drop constraint if exists rate_limits_user_id_fkey;
alter table public.rate_limits add constraint rate_limits_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;
