-- First-run onboarding: a short set of questions asked once, then never again.
--
-- The preferred name already has a home (`name`, which the greeting reads), so
-- this only adds the four answers with nowhere to live yet, plus the stamp that
-- stops the questions coming back.
--
-- Additive and nullable on purpose. Every other column on public.profiles is
-- `not null default`, but these are not, because null carries information here:
-- it means "never asked", which is what every existing row is, and an empty
-- array would be indistinguishable from "asked, picked nothing". The clients
-- map null to the same empty defaults they already use, so a profile written
-- before this migration keeps reading and writing exactly as it did.
--
-- No check constraint on year_level, matching how `theme` and `reminder_mode`
-- are already stored: the allowed set lives with the UI that offers it, and an
-- unrecognised value reads back as "not said" rather than breaking the load.

alter table public.profiles add column if not exists year_level text;
alter table public.profiles add column if not exists focus_areas text[];
alter table public.profiles add column if not exists goals text[];
alter table public.profiles add column if not exists interests text[];

-- Set once the questions are finished *or* skipped, so skipping is a real
-- answer and nobody is asked twice. Everything above stays editable from
-- Settings afterwards, whichever way they left this screen.
alter table public.profiles add column if not exists onboarded_at timestamptz;

-- RLS is unchanged on purpose: profiles_own is `for all` and scoped to the row
-- (id = auth.uid()), so it already covers these columns too.
