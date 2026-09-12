# Backend release checklist

These are operator steps, not a record of a completed deployment. Local handler tests use isolated Supabase dependencies; they do not establish that a hosted database or provider works.

## Select and inspect the target

Use a Supabase project controlled by the publishing adult. Verify its project reference in the dashboard before linking the CLI. The checked-in `supabase/config.toml` contains an existing project reference; do not assume that reference is your intended release target.

```sh
supabase login
supabase link --project-ref YOUR_VERIFIED_PROJECT_REF
supabase migration list --linked
supabase db push --linked --dry-run
```

Review every pending migration and take the project's supported database backup before applying it. The consent migration intentionally switches existing AI sharing off until users consent again; its rate-limit foreign key makes those rows cascade on account deletion.

**Scheduler target:** `20260905035338_schedule_reminder_sweep.sql` defaults to `nufocigzmnnnjbmifeoa`. Before applying migrations to any different project, change that migration's fallback URL in your deployment checkout to that project's `/functions/v1` URL and review the diff. A `set_config` call in an unrelated SQL Editor session does not set the CLI migration session. For an already migrated project, inspect `cron.job` and explicitly correct the existing job URL before enabling reminders. Never attach production reminder credentials to a staging scheduler.

After reviewing the dry run and target:

```sh
supabase db push --linked
```

## Configure secrets and deploy

Set secrets through the target project's Edge Function secrets dashboard. Never put private credentials in `EXPO_PUBLIC_*`, source files, or committed environment files.

- `ENABLE_DEV_CONTROLS`: absent or `false` in production. The destructive development function now returns 404 before reading accounts unless this is exactly `true`. Only explicitly enable it in an isolated test project.
- `ALLOWED_ORIGINS`: the actual HTTPS web origin(s), comma-separated.
- `GROQ_API_KEY`: transcription, advice, tag normalization and optional transcript summaries. The adult account holder must create and manage this secret; never put it in either client or in git.
- `GROQ_API_KEY`: voice transcription.
- `GOOGLE_CSE_API_KEY` and `GOOGLE_CSE_ID`: external article search when enabled.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, and `REMINDER_FROM`: the authorized Gmail sender configuration.
- `APP_URL`: the published HTTPS application URL; `REMINDER_APP_LINK`: the verified mobile deep link if used.
- `REMINDER_CRON_SECRET`: a fresh private scheduler secret. The database Vault entry named `reminder_cron_secret` must contain the same value. Configure this in the target dashboard without putting it in version control.

Supabase supplies its own URL and service-role environment variables to hosted functions. Confirm the project's auth settings and redirect URLs match the release client. Keep email confirmation enabled and use an actual verified account for review.

Deploy only named release functions, with the verified target reference:

```sh
supabase functions deploy entry-advice transcribe-voice normalize-tag spotify-songs article-recs send-test-reminder send-reminders delete-account --project-ref YOUR_VERIFIED_PROJECT_REF
```

The checked-in function configuration retains JWT verification for user endpoints and disables it only for the scheduler endpoint, which checks its own secret. If `dev-control` was previously deployed, deploy its new disabled-by-default handler separately so the old destructive handler does not remain active:

```sh
supabase functions deploy dev-control --project-ref YOUR_VERIFIED_PROJECT_REF
```

## Live verification before submission

Use disposable accounts owned by the operator and actual production-client configuration. Record date, build, target reference, and observed results without recording credentials or journal content.

1. Sign up, confirm email, sign in, save text and voice entries, restart, and confirm entries persist.
2. With sharing off or no current consent, verify advice, transcription, normalization, and music processing refuse the request. Enable consent and confirm the configured services work; revoke it and repeat the refusal check. Article recommendations should remain local when sharing is off.
3. Enable an email reminder, send a test, and verify actual receipt and working links. Inspect the scheduled job's target and execution outcome; disable reminders and confirm the account is no longer selected.
4. Delete the disposable account in the app. Confirm sign-in fails, owned rows are gone from profiles, entries, related tables and rate limits, and the user's `voice-memos` files are gone. The handler removes recordings in batches of at most 1,000 and only deletes the identity after every batch succeeds. A storage error must leave the identity available to retry.
5. Call `dev-control` on production and observe 404 without enabling it. Verify an invalid session cannot use deletion or personal-data endpoints.

Deployment, provider billing/quota, backups and retention, real email delivery, account deletion in hosted storage, and device behavior remain external verification tasks. Do not mark them complete from the local test result alone.
