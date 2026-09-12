-- Patterns page statistics, moved from an in-memory array capped at 500
-- entries into Postgres so they cover a user's full history. This is the
-- mirror image of wellness_metrics_*: those read across every user and are
-- definer + admin-gated; this reads one caller's own rows, so it stays
-- security invoker (the default). RLS on public.entries already restricts
-- rows to `user_id = auth.uid()`, so an invoker function inherits that and
-- cannot leak another user's rows even if the WHERE clause below were wrong.
-- The explicit `user_id = me.uid` filter is defense in depth, not the only
-- guard.
--
-- Weekday and day-part bucketing happens in the caller's own IANA timezone
-- (public.profiles.timezone), not server UTC, so an 11pm entry doesn't drift
-- into the next day. An absent or unrecognised zone falls back to UTC rather
-- than erroring.

create or replace function public.entry_stats()
returns jsonb
language sql
stable
set search_path = public
as $$
  with me as (
    select auth.uid() as uid
  ),
  zone as (
    select case
             when tz.raw is not null
                  and exists (select 1 from pg_timezone_names n where n.name = tz.raw)
               then tz.raw
             else 'UTC'
           end as name
      from (
        select coalesce(
                 (select p.timezone from public.profiles p, me where p.id = me.uid),
                 'UTC'
               ) as raw
      ) tz
  ),
  live as (
    select e.*
      from public.entries e, me
     where me.uid is not null
       and e.user_id = me.uid
       and e.deleted_at is null
  ),
  bounds as (
    select count(*)::bigint as total,
           max(created_at) as newest_at,
           min(created_at) as oldest_at
      from live
  ),
  recent_window as (
    select count(*)::bigint as n, round(avg(live.energy)::numeric, 2) as avg_energy
      from live, bounds
     where bounds.newest_at is not null
       and live.created_at >= bounds.newest_at - interval '30 days'
  ),
  earlier_window as (
    select count(*)::bigint as n, round(avg(live.energy)::numeric, 2) as avg_energy
      from live, bounds
     where bounds.oldest_at is not null
       and live.created_at <= bounds.oldest_at + interval '30 days'
  ),
  weekday_agg as (
    select extract(dow from (live.created_at at time zone zone.name))::int as day,
           count(*)::bigint as n,
           round(avg(live.energy)::numeric, 2) as avg_energy
      from live, zone
     group by 1
  ),
  weekday as (
    select d.day, coalesce(w.n, 0) as n, w.avg_energy
      from generate_series(0, 6) as d(day)
      left join weekday_agg w on w.day = d.day
  ),
  day_part_hours as (
    select extract(hour from (live.created_at at time zone zone.name))::int as h,
           live.mood
      from live, zone
  ),
  day_part_agg as (
    select case
             when h >= 5  and h < 12 then 'morning'
             when h >= 12 and h < 17 then 'afternoon'
             when h >= 17 and h < 22 then 'evening'
             else 'late'
           end as id,
           count(*)::bigint as n,
           round(avg(mood)::numeric, 2) as avg_mood
      from day_part_hours
     group by 1
  ),
  day_part_ids as (
    select * from (values (1, 'morning'), (2, 'afternoon'), (3, 'evening'), (4, 'late')) as ids(ord, id)
  ),
  day_part as (
    select ids.ord, ids.id, coalesce(a.n, 0) as n, a.avg_mood
      from day_part_ids ids
      left join day_part_agg a on a.id = ids.id
  ),
  feelings as (
    select f as feeling, count(*)::bigint as n
      from live, unnest(live.feelings) as f
     group by f
  ),
  recent_entries as (
    select id, created_at, energy
      from live
     order by created_at desc
     limit 14
  )
  select jsonb_build_object(
    'total', (select total from bounds),
    'newestAt', (select newest_at from bounds),
    'oldestAt', (select oldest_at from bounds),
    'energyWindows', jsonb_build_object(
      'recent', jsonb_build_object(
        'n', (select n from recent_window),
        'avgEnergy', (select avg_energy from recent_window)
      ),
      'earlier', jsonb_build_object(
        'n', (select n from earlier_window),
        'avgEnergy', (select avg_energy from earlier_window)
      )
    ),
    'weekday', (
      select coalesce(jsonb_agg(jsonb_build_object('day', day, 'n', n, 'avgEnergy', avg_energy) order by day), '[]'::jsonb)
        from weekday
    ),
    'dayParts', (
      select coalesce(jsonb_agg(jsonb_build_object('id', id, 'n', n, 'avgMood', avg_mood) order by ord), '[]'::jsonb)
        from day_part
    ),
    'feelings', (
      select coalesce(jsonb_agg(jsonb_build_object('feeling', feeling, 'n', n) order by n desc, feeling asc), '[]'::jsonb)
        from feelings
    ),
    'recent', (
      select coalesce(jsonb_agg(jsonb_build_object('id', id, 'createdAt', created_at, 'energy', energy) order by created_at desc), '[]'::jsonb)
        from recent_entries
    )
  )
$$;

revoke all on function public.entry_stats() from public;
grant execute on function public.entry_stats() to authenticated;
revoke execute on function public.entry_stats() from anon;

-- Timeline search moving server-side. PostgREST's `or(...)` can only express
-- per-column filters, not a concatenated expression, so a query-side
-- expression index is unreachable from that client — the index has to be a
-- real column the query can name directly. The old client-side search also
-- covered feelings, bullets and gratitude, and entries written in
-- bullets/gratitude mode have no `body` at all, so those arrays have to be
-- folded in too or those entries become permanently unfindable.
--
-- search_text is additive and nullable-by-construction (a generated value,
-- never written directly), matching how the other recent migrations in this
-- file added columns. Postgres requires every function in a generated
-- column's expression to be IMMUTABLE, and coalesce/|| both are — but the
-- built-in array_to_string(anyarray, text) is STABLE, not IMMUTABLE, because
-- for an arbitrary anyarray it may call a type's output function, which can
-- be session-dependent. That reasoning does not apply once the input is
-- narrowed to text[] specifically: every element is already text, so joining
-- them is a pure, locale-independent string operation with nothing
-- session-dependent left to vary. text_array_join_immutable below encodes
-- that narrower, honest claim; it must not be widened to anyarray, which
-- would silently reintroduce the exact hazard it exists to avoid.
create or replace function public.text_array_join_immutable(arr text[], sep text default ' ')
returns text
language sql
immutable
set search_path = public
as $$
  select array_to_string(coalesce(arr, '{}'::text[]), sep);
$$;

-- This materialises a second copy of every entry's text on disk (title +
-- body + transcript + transcript_summary + bullets + gratitude + feelings,
-- concatenated). That storage cost is accepted as the price of one indexable
-- search column instead of four unindexable ones.
alter table public.entries add column if not exists search_text text
  generated always as (
    coalesce(title, '') || ' ' ||
    coalesce(body, '') || ' ' ||
    coalesce(transcript, '') || ' ' ||
    coalesce(transcript_summary, '') || ' ' ||
    public.text_array_join_immutable(bullets, ' ') || ' ' ||
    public.text_array_join_immutable(gratitude, ' ') || ' ' ||
    public.text_array_join_immutable(feelings, ' ')
  ) stored;

-- One trigram index on that one column. Accelerates:
--
--   select ...
--     from public.entries
--    where user_id = :user_id
--      and deleted_at is null
--      and search_text ilike '%' || :term || '%'
--
-- which is exactly what `search_text.ilike.%term%` compiles to over
-- PostgREST's `or(...)`. user_id scoping is left to the existing
-- entries_user_created_live_idx (and RLS); this index only needs to make the
-- text predicate fast.
-- Installed into extensions (Supabase's convention), not public, so it
-- doesn't trip the security advisor's "extension in public schema" flag.
-- extensions is already on this database's search_path, so gin_trgm_ops
-- below resolves without further qualification — don't "simplify" this back
-- to a bare `create extension if not exists pg_trgm;`.
create extension if not exists pg_trgm with schema extensions;

create index if not exists entries_search_text_trgm_idx
  on public.entries
  using gin (search_text gin_trgm_ops)
  where deleted_at is null;
