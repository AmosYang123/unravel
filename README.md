# Remix of Exeter -- Healthcare Faye

Create an empty project (with no pages)

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/84c4d780-f5b2-4e1e-bf06-94bd0c7df4d9).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
# Reminder email setup

Reminder emails are sent by `unravelreminders@gmail.com` through the Gmail API. The sender credentials belong only in Supabase Edge Function secrets; never put them in `.env`, the mobile app, or source control.

Configure these secrets before deploying `send-reminders` and `send-test-reminder`:

- `GOOGLE_CLIENT_ID` — OAuth client ID from Google Cloud
- `GOOGLE_CLIENT_SECRET` — matching OAuth client secret
- `GOOGLE_REFRESH_TOKEN` — refresh token authorized by `unravelreminders@gmail.com` with the `gmail.send` scope
- `REMINDER_FROM=Unravel <unravelreminders@gmail.com>`
- `REMINDER_APP_LINK=unravel://write?mode=short`
- `REMINDER_CRON_SECRET` — same random value stored in the database Vault as `reminder_cron_secret`

Enable the Gmail API in the Google Cloud project and add `unravelreminders@gmail.com` as an OAuth test user while the consent screen remains in testing. A refresh token can then be created through Google's OAuth flow. Do not use the Gmail account password or an app password: Supabase Edge Functions block outbound SMTP ports, while the Gmail API uses HTTPS.

The iOS app already registers the `unravel` URL scheme. Add `unravel://**` to Supabase Auth's additional redirect URLs if the same app scheme is later used for confirmations or password resets.
