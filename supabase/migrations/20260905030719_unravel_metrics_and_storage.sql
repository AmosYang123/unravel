-- Aggregate wellness metrics behind the admin-only Impact page, plus the
-- private voice-memo bucket.
--
-- These read across every user, so each one is definer + admin-gated.
-- person_code is a stable hash, never a user id, so the page cannot identify
-- anyone.

create or replace function public.wellness_metrics_overview()
returns table (
  total_entries bigint, total_people bigint,
  avg_mood numeric, avg_energy numeric, breathed_entries bigint
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'not authorized';
  end if;
  return query
  select count(*)::bigint, count(distinct e.user_id)::bigint,
         round(avg(e.mood)::numeric, 2), round(avg(e.energy)::numeric, 2),
         count(*) filter (where e.breathed)::bigint
    from public.entries e;
end; $$;

create or replace function public.wellness_metrics_weekly()
returns table (
  week text, entries bigint, people bigint,
  avg_mood numeric, avg_energy numeric
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'not authorized';
  end if;
  return query
  select to_char(date_trunc('week', e.created_at), 'YYYY-MM-DD'),
         count(*)::bigint, count(distinct e.user_id)::bigint,
         round(avg(e.mood)::numeric, 2), round(avg(e.energy)::numeric, 2)
    from public.entries e
   group by date_trunc('week', e.created_at)
   order by date_trunc('week', e.created_at);
end; $$;

create or replace function public.wellness_metrics_trajectory()
returns table (
  person_code text, entries bigint,
  first_entry_at timestamptz, last_entry_at timestamptz,
  early_avg_mood numeric, early_avg_energy numeric,
  recent_avg_mood numeric, recent_avg_energy numeric
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'not authorized';
  end if;
  return query
  with ranked as (
    select e.user_id, e.mood, e.energy, e.created_at,
           row_number() over (partition by e.user_id order by e.created_at)      as asc_rank,
           row_number() over (partition by e.user_id order by e.created_at desc) as desc_rank,
           count(*)   over (partition by e.user_id)                              as total
      from public.entries e
  )
  select left(md5(r.user_id::text), 6), max(r.total)::bigint,
         min(r.created_at), max(r.created_at),
         round(avg(r.mood)   filter (where r.asc_rank  <= 5)::numeric, 2),
         round(avg(r.energy) filter (where r.asc_rank  <= 5)::numeric, 2),
         round(avg(r.mood)   filter (where r.desc_rank <= 5)::numeric, 2),
         round(avg(r.energy) filter (where r.desc_rank <= 5)::numeric, 2)
    from ranked r
   group by r.user_id
  having max(r.total) >= 2
   order by min(r.created_at);
end; $$;

revoke all on function public.wellness_metrics_overview()   from public;
revoke all on function public.wellness_metrics_weekly()     from public;
revoke all on function public.wellness_metrics_trajectory() from public;
grant execute on function public.wellness_metrics_overview()   to authenticated;
grant execute on function public.wellness_metrics_weekly()     to authenticated;
grant execute on function public.wellness_metrics_trajectory() to authenticated;

-- Paths are `<user_id>/<uuid>.<ext>`, so the first folder segment is the
-- ownership check.
insert into storage.buckets (id, name, public)
values ('voice-memos', 'voice-memos', false)
on conflict (id) do nothing;

drop policy if exists voice_memos_own_select on storage.objects;
create policy voice_memos_own_select on storage.objects
  for select to authenticated
  using (bucket_id = 'voice-memos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists voice_memos_own_insert on storage.objects;
create policy voice_memos_own_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'voice-memos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists voice_memos_own_update on storage.objects;
create policy voice_memos_own_update on storage.objects
  for update to authenticated
  using (bucket_id = 'voice-memos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists voice_memos_own_delete on storage.objects;
create policy voice_memos_own_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'voice-memos' and (storage.foldername(name))[1] = auth.uid()::text);
