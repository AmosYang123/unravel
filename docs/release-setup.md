# Finish the release configuration

The code contains a public landing page at `/`, privacy at `/privacy`, and support at `/support`. They work without Supabase environment variables and do not start an account session. The existing web journal is at `/journal`; account routes and password recovery require the Supabase variables. Nothing is published by these changes. Operators are Amos Yang and Faye Yang; support is `unravelreminders+support@gmail.com`. Public URL fields remain empty.

## Public contact details

1. Completed: `ownerName` is now `Amos Yang and Faye Yang`, as supplied. This public operator label does not establish Apple's seller/account name or legal ownership.
2. Completed: the selected support address is `unravelreminders+support@gmail.com`. Send a test message from another address and reply to confirm the support workflow. Decide who checks these messages.
3. `ownerName` and `supportEmail` are configured in `mobile/lib/release-config.ts`. These values are public and bundled in both apps. Never put credentials in this file. The web app imports this single source; native imports stay inside the Metro project root.

## Public website

Build the existing web app with `npm run build` and publish its `dist` directory to an HTTPS static host of your choice. Configure an SPA fallback: requests for paths that are not files must serve `index.html`, keeping the requested URL. The host must serve `/privacy`, `/support`, `/reset-password` and `/auth` on direct visits.

After publishing, open `/privacy` and `/support` in a signed-out/private browser. Verify the contact details and policy, then set `privacyUrl` and `supportUrl` in `mobile/lib/release-config.ts` to those full HTTPS addresses. Rebuild both clients after changing configuration. A placeholder hostname does not count as a published site.

Set `EXPO_PUBLIC_PASSWORD_RESET_URL` to the site's full `/reset-password` address and `EXPO_PUBLIC_CONFIRMATION_URL` to its full `/auth` address in the mobile release environment. In the intended Supabase project's Authentication URL Configuration, set the production Site URL and allowlist those exact redirect URLs. Test an actual confirmation email and password reset from the released app. Configure the same production `VITE_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_URL` in web and native, with their respective `VITE_SUPABASE_PUBLISHABLE_KEY` / `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Only publishable or legacy anon keys belong in clients; never secret or service-role keys. Keep `.env` files out of git.

## Check before submitting

To deploy on Vercel:

1. Make these files available in your Git repository, keeping `.env` files and secrets out of it.
2. In Vercel choose Add New → Project and import that repository.
3. Set Root Directory to the repository root (not `mobile` or `confirmation-email`), Framework Preset to Vite, Build Command to `npm run build`, and Output Directory to `dist`.
4. For the public brochure alone, no Supabase variables are needed. To also enable the web journal and reset-password flow, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. This exposes the existing app, whose provider release blockers still need resolving.
5. Deploy, then open `/`, `/privacy`, and `/support` directly in a signed-out browser. Ensure production pages do not require a Vercel login.
6. Put the resulting full policy/support URLs into `mobile/lib/release-config.ts`, then rebuild/redeploy. Configure confirmation/recovery redirects as described above only when enabling account features.

The included `vercel.json` provides the SPA fallback. See [Vite deployment](https://vite.dev/guide/static-deploy.html) and [Vercel's Vite SPA configuration](https://vercel.com/docs/frameworks/frontend/vite). This change does not create an account or deploy. The public site is deployable before the app is ready for submission; its policy/contact fields still need completion.

The privacy screens now include the full installed Fraunces and Karla font notices and licenses, bundled with native and web code. Other content rights still need verification. Browser and physical-device visual inspection was not available in this implementation session.

Run `npm run release:preflight` with Node 22.18+ (Node 24 is supported). It reads root and mobile `.env` / `.env.local` files; exported environment variables take precedence. It prints missing field names, never key values. It does not run on ordinary development or production builds.

Create an ignored `release-evidence.json` using the keys in `release-evidence.example.json`. Fill each value with a reference to your completed check, such as a dated private test report or license record. Do not include review-account passwords or user data. Required keys cover backend deployment/live deletion, public pages, provider settings, privacy labels, content rights, signed-device tests, archive inspection and review setup. The command intentionally fails until these references and public configuration are supplied. Passing means references are present, not that the code has independently verified them or Apple will approve the app.

Follow `docs/app-store-readiness.md` for the real device walkthrough and provider inventory. Confirm actual authentication email delivery, backup/log retention and AI provider settings before finalizing the policy. Music, artwork, articles, images and fonts require actual rights evidence; this checklist grants no rights. No deployment, signed build, production provider verification or App Store submission was performed by this change.
