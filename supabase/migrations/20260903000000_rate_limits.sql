-- Per-user rate limiting for edge functions.
-- Counters live in Postgres because edge instances are ephemeral and per-region,
-- so an in-memory counter would reset constantly and never hold across regions.

create table if not exists public.rate_limits (
  user_id uuid not null,
  bucket text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (user_id, bucket, window_start)
);

-- No policies: the table is reachable only through the security-definer function below.
alter table public.rate_limits enable row level security;

create index if not exists rate_limits_window_start_idx
  on public.rate_limits (window_start);

-- Counts one call for the calling user in a fixed window and reports whether it
-- is still under the limit. auth.uid() is the verified JWT `sub`, so the key
-- cannot be supplied or spoofed by the client.
create or replace function public.consume_rate_limit(
  p_bucket text,
  p_limit integer,
  p_window_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_window timestamptz;
  v_count integer;
begin
  if v_user is null then
    return false;
  end if;

  if p_bucket is null or length(p_bucket) = 0 or length(p_bucket) > 64 then
    raise exception 'invalid bucket';
  end if;

  p_limit := greatest(1, least(coalesce(p_limit, 1), 10000));
  p_window_seconds := greatest(1, least(coalesce(p_window_seconds, 60), 86400));

  v_window := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into public.rate_limits (user_id, bucket, window_start, count)
  values (v_user, p_bucket, v_window, 1)
  on conflict (user_id, bucket, window_start)
    do update set count = public.rate_limits.count + 1
  returning count into v_count;

  -- Opportunistic cleanup of windows nobody will read again.
  delete from public.rate_limits
   where window_start < now() - interval '1 day';

  return v_count <= p_limit;
end;
$$;

revoke all on function public.consume_rate_limit(text, integer, integer) from public;
grant execute on function public.consume_rate_limit(text, integer, integer) to authenticated;
