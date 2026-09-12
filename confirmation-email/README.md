# confirmation-email

A tiny static page for the link Supabase sends when someone confirms their
email. No build step, no framework, no dependencies — just `index.html`,
`style.css`, `config.js` and `app.js`. Vercel can serve it as-is.

## Deploy it (Vercel)

1. In Vercel, "Add New… → Project", import this repo, and set **Root
   Directory** to `confirmation-email`. Leave build command and output
   directory empty — there's nothing to build.
2. Deploy. You'll get a URL like `https://confirmation-email-xyz.vercel.app`
   (or attach your own domain).

## Point Supabase at it

In the Supabase dashboard: **Authentication → URL Configuration**.

- **Site URL**: set to the deployed URL from step 2 above (e.g.
  `https://confirmation-email-xyz.vercel.app`).
- **Redirect URLs**: add the same URL. If you want to keep the confirmation
  page and the main app under one Supabase project without re-adding a URL
  every time you deploy a preview, add a wildcard too, e.g.
  `https://confirmation-email-xyz.vercel.app/*` — but the exact URL from step
  2 is enough for a single production deployment.

That's it — Supabase's "Confirm signup" email template already links to
`{{ .SiteURL }}`, so once Site URL points here, new confirmation emails land
on this page.

## Point it back at the app

Open `config.js` — everything you'd ever need to change lives at the top of
that one file:

- `APP_SCHEME` — the app's custom URL scheme (`unravel://`, see
  `mobile/app.json`). This is what "Open Unravel" tries first. Leave this
  alone unless the scheme changes.
- `APP_URL` — where to send someone if the scheme above doesn't open
  anything (app not installed, or on desktop). There's no deployed web app
  yet, so this is left blank on purpose; the page just tells people to open
  Unravel on their phone instead. Fill this in once a real web app URL
  exists.

Nothing else in this folder hardcodes a URL.

`unravel://` only opens the app from a real build — TestFlight, the App
Store, or a dev build. Inside Expo Go the scheme is different, so testing
the "Open Unravel" button there will not open the app.

## Why no Supabase key here

This page doesn't call Supabase at all. By the time someone lands here,
Supabase has already confirmed (or rejected) the link server-side — we're
only reading the success/error info Supabase put in the URL and showing a
plain-language message. No anon key, no client library, nothing secret. The
whole page is public by design.
