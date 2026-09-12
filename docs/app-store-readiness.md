# Unravel App Store readiness — September 11, 2026

**Status: not ready to submit.** Local fixes are implemented; public contact details, deployment, provider configuration, content rights and a signed-device release test remain unverified. This is an implementation audit, not an Apple approval certificate.

September 12 follow-up: public landing `/`, `/support`, `/privacy`, native public website links and an explicit `npm run release:preflight` check are wired to `mobile/lib/release-config.ts`. Web journal home is now `/journal`; authentication remains required. Operators are **Amos Yang and Faye Yang**, as supplied by the user. Support is **unravelreminders+support@gmail.com**. The public site is deployed at **https://officialunravel.vercel.app**. See [release setup](release-setup.md) and [privacy/content-rights review](privacy-content-rights.md). Backend/provider/device readiness remains unverified.

## Working checklist

Website verification: 92 tests passed, web/mobile TypeScript passed, production web build passed, ESLint has 0 errors and 15 existing warnings. After setting the support alias, 8 affected tests and the production build passed again. Browser visual inspection could not complete because macOS Accessibility/Screen Recording permissions remain pending. No deployment or email was sent.

- [x] Implement account deletion batching, consent checks and native password recovery (local tests passed in prior work).
- [x] Add public landing, privacy and support website code for Vercel.
- [x] Record user-supplied operator names: Amos Yang and Faye Yang.
- [x] Include font notices; serve website fonts locally.
- [x] Complete code-based data inventory and provider/content-terms review.
- [x] Set the user-selected support address: `unravelreminders+support@gmail.com`.
- [ ] Test receiving and replying to a support email.
- [x] Deploy website and verify `/`, `/privacy`, `/support`, and a bundled license over public HTTPS (HTTP 200 on September 12, 2026).
- [ ] Resolve Gemini API under-18 audience prohibition; current teen-oriented integration is blocked.
- [ ] Resolve Deezer use permission and Google search result storage rights.
- [ ] Confirm logo/icon provenance.
- [ ] Verify production provider/SMTP/retention settings and finalize policy/App Privacy labels.
- [ ] Deploy backend changes and test real consent, email and account deletion.
- [ ] Build signed release, inspect archive, and test supported physical devices.
- [ ] Prepare App Store listing, age rating, screenshots and working review account.

## Apple sources and scope

Retrieved September 11, 2026. Searched Apple developer documentation for review/privacy/AI sharing, deletion, age rating, review access, SDKs and manifests. Selected Apple's primary guidance; excluded forum anecdotes and third-party interpretations. Reviewed the Expo 57 documentation required by `mobile/AGENTS.md` before changing mobile code.

- [Review guidelines](https://developer.apple.com/app-store/review/guidelines/): completeness, review access, safety, permissions, privacy, login, content rights and business rules.
- [Account deletion](https://developer.apple.com/support/offering-account-deletion-in-your-app/): in-app initiation and deletion of associated data rather than deactivation.
- [Privacy disclosures](https://developer.apple.com/app-store/app-privacy-details/): disclose collection by the app and partners, purposes, linkage and tracking.
- [Age questionnaire](https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating/): answer based on app content and capabilities.
- [SDK requirements](https://developer.apple.com/support/third-party-SDK-requirements/) and [submission requirements](https://developer.apple.com/news/upcoming-requirements/): inspect the final binary, SDK manifests and approved API reasons; current uploads require Xcode 26+ and iOS 26 SDK+. Expo 57 specifies Xcode 26.4+.
- [Expo 57](https://docs.expo.dev/versions/v57.0.0/), [audio configuration](https://docs.expo.dev/versions/v57.0.0/sdk/audio/) and [privacy manifests](https://docs.expo.dev/guides/apple-privacy/).

## Findings and changes

| Area | Evidence / local action | Remaining acceptance evidence |
| --- | --- | --- |
| Account deletion | Native Settings → Account invokes permanent Auth deletion after recording cleanup; existing database FKs cascade. Added a cascade for previously orphaned rate-limit counters and tests for authentication, pagination and failure. | Apply migration/deploy function, then delete a disposable live account and verify Auth, all tables and Storage. Check backup/log retention separately. |
| AI consent | Previously on by default; advice, transcription and normalization lacked server checks. Now off by default, versioned informed consent is required in both clients and on all five external recommendation endpoints. Legacy true settings do not count. | Deploy server checks before releasing clients. Verify production provider terms and retention. |
| Policy | Matching policy content, public `/privacy` web route and native policy page linked from auth and Settings; corrected claims that only the user could read synced data. | Policy is a draft until owner, contact, exact SMTP provider and backup/log retention are completed. Publish to an HTTPS host and put its URL in App Store Connect. Native public website link must be added once URL exists. |
| Permissions | Mic requested on recording action; notification request on enable/test action. Denial leaves text journaling available. Purpose text now explains cloud upload. Disabled unnecessary background audio modes. | Test fresh-install allow/deny/revoke on a physical iPhone and iPad. |
| Privacy labels | Provider and data inventory below includes the built-in administrator statistics dashboard. | Confirm deployed services/logging configuration and enter final answers in App Store Connect. |
| Age rating | No Made for Kids selection. Wellness reading and unfiltered music catalogue can include mature subjects/lyrics. | Complete current questionnaire honestly; do not assume 4+ or select all “None.” Review generated responses and catalogue content. |
| Review access | Walkthrough below covers journaling, optional AI, reminders and deletion. | Create a confirmed disposable demo account and supply its credentials privately in App Store Connect; explain restricted administrator tools. |
| Rights/completeness | Article links use attribution; music uses Deezer artwork/previews; fonts and images ship with the app. No active references to ScreenPlaceholder found. | Verify rights/terms for artwork, music previews, snippets, logo and bundled fonts. Public API availability is not proof of a distribution license. Run release-device tests. |
| Login/payment | Email/password and optional Supabase anonymous login found; no social login or paid unlocks found. | Retest if adding third-party login, subscriptions or digital purchases; corresponding Apple login/payment requirements may apply. |
| Native archive | Dependency privacy manifests exist in installed React Native, AsyncStorage and Expo modules. | Inspect aggregated manifest and SDK signatures in archive; do not guess required-reason API codes. Xcode is unavailable in the active local toolchain, so archive validation was not performed. |

## App Privacy worksheet (proposed, verify against production)

Do not select “Data Not Collected.” Account-linked data includes anonymous Supabase user IDs. “Optional” features still need disclosure unless Apple's specific exemption actually applies.

| Data / Apple category to evaluate | Recipient | Purpose / linkage |
| --- | --- | --- |
| Name, email / Contact Info | Supabase; Google Gmail for enabled reminders; configured authentication email provider | App Functionality; linked to account |
| User ID / Identifiers | Supabase | Authentication, security/rate limiting; linked |
| Journal text, transcripts, addenda, tags / Other User Content | Supabase; Google Gemini after consent | App Functionality, Product Personalization; linked |
| Voice / Audio Data | Supabase; Groq for transcription (also automatic after saving voice entries with AI enabled) | App Functionality; linked |
| Mood, energy and wellbeing content / Health, Sensitive Info where applicable | Supabase; Google Gemini after consent | Functionality, Personalization and Analytics for admin mood/usage reports; linked |
| Interests, goals, school year, music preferences / Other Data and applicable content categories | Supabase; Google Gemini, Google Custom Search, Deezer for enabled features | Personalization; linked internally even if no account ID is sent to provider |
| Entry counts/times, breathing and pseudonymous longitudinal trends / Product Interaction | Supabase and restricted administrator dashboard | Functionality and Analytics; account linkage remains possible |
| IP/request metadata, errors / Diagnostics or Other Data as applicable | Hosting, Supabase, Google, Groq, Deezer and destination websites | Verify actual retention, association and purposes with each provider |

No ad SDK or cross-company advertising tracking was found. This is a code finding, not verification of all provider practices. Do not request ATT solely because cloud services exist; reassess if tracking is introduced. Authentication SMTP is not identifiable from this repository. Reminder Gmail is identifiable. Verify whether paid Google AI processing terms apply, training/retention controls, Groq retention, subprocessors, and equal data protection before publishing the policy. Do not promise zero retention or that providers never train without confirming the account configuration.

## Deployment order

1. Back up and review the new SQL migration. Apply `20260911000000_explicit_sharing_consent.sql` to the intended Supabase project. It intentionally clears preexisting AI defaults, adds the consent version and cascades usage counters on account deletion.
2. Deploy `entry-advice`, `transcribe-voice`, `normalize-tag`, `spotify-songs`, `article-recs`, and `delete-account` together with `_shared/sharing-consent.ts`. Confirm configured CORS origins include the real web host. The backend denies missing, stale, revoked or unreadable consent.
3. Complete and deploy the public policy/support pages. Set the privacy/support URLs and contact details in App Store Connect, then add the website link in the native policy screen.
4. Build the updated native client. Confirm the archive uses the correct bundle ID, signing, SDK, manifests, entitlements and microphone purpose string. Complete export-compliance questions based on actual encryption use (including local hashing); do not guess.
5. Run the device walkthrough below. Old clients cannot grant the current consent version. Requests already dispatched before revocation cannot be recalled.

No production migration, Edge Function deployment, website publication or App Store Connect submission was performed by this audit.

## Review notes / test walkthrough

Provide a working, email-confirmed demo account in the private App Review Information fields. Use invented journal content only. Keep a second disposable account for destructive deletion testing. Do not put passwords in this repo. Anonymous mode is conditional on the Supabase project setting, so do not rely on it as the sole review path.

1. Sign in, complete or skip onboarding. Explain that optional questions personalize the journal.
2. Create text, short, bullet, prompt, gratitude and mood entries. Record a voice memo only after tapping Record. Save, reopen, play, edit/add a note, bookmark, search History and inspect Insights.
3. In Settings → Privacy & data, enable AI suggestions, read the named-provider disclosure and choose Allow sharing. Save an entry for a reflection/song suggestion. Save a voice entry to exercise automatic transcription for its AI reflection; the entry also offers manual transcription when needed. Inspect Reading and Music. Turn sharing off and verify basic journaling still works. There is no payment gate.
4. Set reminder schedule, enable device notifications and send a test. Separately enable/test reminder email. Deny OS permissions in a fresh install and verify text entries and breathing still work.
5. Export a journal, use/recover recently deleted entries, permanently delete an entry. Enable/change/disable passcode lock; background and reopen the app.
6. Settings → Account → Delete account, confirm, then verify the disposable account cannot sign in and its data/recordings are removed. Verify failed cleanup is reported rather than presented as success.
7. Open Privacy policy before sign-in and from Settings; verify public HTTPS policy/support URLs without a login. Test password reset, email confirmation, sign-out/account switching and offline errors.
8. Restricted admin Impact/developer tools must be explained in review notes. If Apple needs to inspect them, provide access only to an isolated review environment containing fictitious users, never real users' data.

Run on supported iPhone and iPad sizes, with large text, small screen, slow/offline networking, an expired session, no email app, and missing/failed provider responses. Check AI reflection wording and linked reading for medical claims; describe the app as journaling/general wellbeing, not diagnosis or treatment. Screenshots and listing copy must reflect this release. Complete content-rights declaration, age questionnaire, support/review contact, availability and any applicable EU trader status.

## Verification performed

Web and mobile TypeScript checks, web production build and iOS JavaScript/Hermes export pass. ESLint reports no errors (15 existing warnings). 65 automated tests pass. Browser visual inspection was unavailable because no browser is connected. Automated coverage includes consent confirmation/cancellation/save failure, server consent failure modes, public policy rendering and actual account-deletion handler behavior, alongside existing auth/store/reminder tests. Native release-device behavior, live deletion, deployed provider settings and App Store Connect metadata remain unverified.
