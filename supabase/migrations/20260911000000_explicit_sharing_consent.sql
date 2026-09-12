-- Previously enabled defaults are not evidence of informed permission.
alter table public.profiles add column ai_consent_version text;
alter table public.profiles alter column ai_suggestions_enabled set default false;
update public.profiles set ai_suggestions_enabled = false;

-- Usage counters also belong to the account and must disappear on deletion.
delete from public.rate_limits where user_id not in (select id from auth.users);
alter table public.rate_limits add constraint rate_limits_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;
