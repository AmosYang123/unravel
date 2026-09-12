-- Sweep every 15 minutes. The function itself decides who is actually due,
-- based on each profile's reminder_time and timezone, so a frequent sweep is
-- what makes per-timezone delivery land near the right local time.
--
-- cron.schedule() replaces a job that already has this name, so re-applying
-- re-points the existing sweep rather than stacking a second copy of it.
--
-- The base URL defaults to production. Override it before applying anywhere
-- else, so a staging database cannot drive production's reminder emails:
--
--   select set_config('unravel.functions_base_url', 'https://<ref>.supabase.co/functions/v1', false);
do $$
declare
  v_base text := coalesce(
    nullif(current_setting('unravel.functions_base_url', true), ''),
    'https://nufocigzmnnnjbmifeoa.supabase.co/functions/v1'
  );
begin
  perform cron.schedule(
    'send-reminders-sweep',
    '*/15 * * * *',
    format($job$
    select net.http_post(
      url     := %L,
      headers := jsonb_build_object(
                   'Content-Type', 'application/json',
                   'Authorization', 'Bearer ' || (
                     select decrypted_secret from vault.decrypted_secrets
                      where name = 'reminder_cron_secret'
                   )
                 ),
      body    := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
    $job$, v_base || '/send-reminders')
  );
end
$$;
