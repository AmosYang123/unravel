-- pg_cron schedules the reminder sweep; pg_net lets it call the edge function
-- over HTTP. Both live outside public so they are not exposed through PostgREST.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net  with schema extensions;

-- The cron secret is held in Vault rather than inlined in the job command, so
-- it does not sit in cron.job in plaintext.
--
-- The value itself is deliberately not in this file. It has to match the
-- send-reminders function's LOVABLE_CRON_SECRET, and a shared secret committed
-- to version control is a secret that has leaked. Supply it for the session
-- immediately before applying this migration to a new environment:
--
--   select set_config('unravel.reminder_cron_secret', '<same value as LOVABLE_CRON_SECRET>', false);
--
-- Where the secret already exists this is a no-op, so re-applying never needs
-- the value at all.
do $$
declare
  v_secret text := nullif(current_setting('unravel.reminder_cron_secret', true), '');
begin
  if exists (select 1 from vault.secrets where name = 'reminder_cron_secret') then
    return;
  end if;

  if v_secret is null then
    raise exception 'reminder_cron_secret has not been provided'
      using hint = 'Run select set_config(''unravel.reminder_cron_secret'', ''<value>'', false); in the same session, then re-apply.';
  end if;

  perform vault.create_secret(
    v_secret,
    'reminder_cron_secret',
    'Bearer token send-reminders checks before doing anything'
  );
end
$$;
