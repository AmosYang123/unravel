# App Review notes — version 1.0, build 12

This build resolves the Guideline 5.1.1(i) and 5.1.2(i) rejection by removing third-party AI processing from the released app.

- Unravel does not send journal text, moods, feelings, labels, profile preferences, voice recordings, or transcripts to Groq, Gemini, or any other third-party AI service.
- Advice and song suggestions now use rules and content bundled with the app.
- Voice transcription and personalized external web search have been removed.
- The microphone is used only when the user chooses to record a voice memo. The recording is stored in the user's private Supabase journal account for playback and is not sent to an AI or transcription service.
- Reading suggestions use a hand-checked library bundled with Unravel. Journal content is not sent to search providers.
- Legacy external-processing server endpoints now return HTTP 410 without contacting any provider, and the included database migration turns off every legacy AI-sharing setting.
- The in-app and public privacy policy now identify the data collected, how it is collected, every use, and the remaining service providers: Supabase for authentication/database/file storage/server functions, Vercel for web hosting, and Google Gmail infrastructure for reminder email.

Suggested review path:

1. Sign in with the review account.
2. Create a written or mood entry and save it.
3. Open “Advice & encouragement” or “Song options”; results are produced from bundled content without external AI.
4. Create a voice entry. The microphone prompt states that the recording is not sent to AI or transcription. Save and play it back from the entry detail screen.
5. Open Settings → Privacy & data to see the on-device suggestions disclosure and the privacy-policy link.

Public privacy policy: https://officialunravel.vercel.app/privacy
Support: https://officialunravel.vercel.app/support
