# Build 12 final handoff

Code is on `origin/main` at commit `11ff0d9`. Automated verification completed locally: 206 tests pass, web typecheck/build pass, mobile typecheck passes, Expo dependencies match SDK 57, and `npx expo export --platform ios` succeeds.

The remaining work requires account access or a physical signed-device check. Complete it in this order.

## 1. Deploy the web privacy policy

Production `https://officialunravel.vercel.app/privacy` still serves the old Groq policy. Log in to the Vercel account that owns `officialunravel`, open the project, and deploy commit `11ff0d9` from `AmosYang123/unravel` `main`. If the Git integration points at a different repository/branch, correct it or run from the repository root:

```sh
npx vercel login
npx vercel --prod
```

After deployment, open these in a private window and verify they require no login:

- `https://officialunravel.vercel.app/privacy` — shows “Updated October 31, 2026” and “No third-party AI sharing”
- `https://officialunravel.vercel.app/support`

Do not use `unravel.app`; that domain currently has an invalid certificate chain in this environment and redirects to a parked `/lander` page.

## 2. Disable legacy processing in Supabase

Log in to the Supabase account that owns project `nufocigzmnnnjbmifeoa`, then from the repository root run:

```sh
npx supabase login
npx supabase link --project-ref nufocigzmnnnjbmifeoa
npx supabase db push
npx supabase functions deploy entry-advice transcribe-voice normalize-tag spotify-songs article-recs --project-ref nufocigzmnnnjbmifeoa
```

The migration resets all legacy AI consent. The first four functions return HTTP 410 without contacting a provider. `article-recs` receives `suggestions: false` from build 12 and uses its bundled library. In Supabase Project Settings → Edge Functions → Secrets, remove `GROQ_API_KEY`, `TAVILY_API_KEY`, `GOOGLE_CSE_API_KEY`, and `GOOGLE_CSE_ID` after deployment so no production credential remains capable of external AI/search processing.

## 3. Build and upload iOS build 12

The currently selected Google account does not own the existing Expo project, so sign in with the Expo account that owns project `24e6c786-7d6d-4657-b639-dd8990224354`. Then:

```sh
cd mobile
npx eas-cli login
npx eas-cli build --platform ios --profile production --auto-submit
```

The production profile uses remote versioning and `autoIncrement`, so this should create build 12 and upload it to App Store Connect. Do not create a new Expo project: it would not own the existing project ID or credentials.

## 4. Signed-device smoke test

Install build 12 through TestFlight on a supported iPhone and verify:

1. Sign in/create a disposable confirmed account.
2. Save written, mood, and voice entries.
3. Open Advice & encouragement and Song options; they work offline/from bundled content.
4. Voice entry plays back and offers no transcription control.
5. Reading shows the bundled-library privacy notice.
6. Settings → Privacy & data shows “On-device suggestions” and no AI-sharing toggle.
7. Privacy and Support links open publicly.
8. Export entries, delete one, restore/purge it, and delete the disposable account.

## 5. App Store Connect preparation

For version 1.0, select build 12 after processing. Use:

- Review notes: `APP_STORE_REVIEW_NOTES.md`
- Privacy questionnaire worksheet: `APP_STORE_PRIVACY_ANSWERS.md`
- Listing copy: `docs/app-store-listing.md`
- Privacy URL: `https://officialunravel.vercel.app/privacy`
- Support URL: `https://officialunravel.vercel.app/support`

Provide a working, email-confirmed review account in the private App Review sign-in fields. Paste the review notes only after the website, Supabase deployment, and signed-device checks above pass.

Reply to the rejected review thread with:

> Thank you for the guidance. In build 12 we removed third-party AI processing from the released app. Unravel no longer sends journal text, moods, feelings, labels, profile preferences, voice recordings, or transcripts to Groq, Gemini, or any other third-party AI service. Advice and song suggestions now use rules and content bundled with the app; voice transcription and personalized external web search have been removed. Legacy processing endpoints are disabled, and the privacy policy has been updated to identify all data collected, how it is collected and used, and the remaining service providers. Please review build 12. Detailed testing steps are included in App Review Information.

Saving the notes and posting this reply communicates externally as the developer; review the text at the moment of posting. Stop before the final “Submit for Review” button so the account owner can click it.
