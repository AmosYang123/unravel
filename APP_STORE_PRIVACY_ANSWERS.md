# App Store Connect privacy answers — build 12

Confirm these against the deployed production configuration before saving them in App Store Connect.

Data linked to the user and used for App Functionality:

- Contact Info → Email Address: account creation, authentication, password recovery, and configured reminder email.
- User Content → Other User Content: written journal entries, prompts, labels, addenda, preferences, and saved aftercare; stored in Supabase for journal functionality and sync.
- User Content → Audio Data: optional voice memos; stored in Supabase for private playback. Not transcribed and not sent to AI.
- Sensitive Info / Health where Apple’s questionnaire considers moods, feelings, energy, or wellbeing reflections applicable: stored for journal functionality and private insights.
- Identifiers → User ID: Supabase account identifier used for authentication and associating private records.

Data not used for tracking. No advertising. No data-broker sale. No journal content used for third-party advertising or AI training.

Diagnostics/technical request data may be processed by Supabase and Vercel for security, reliability, and app functionality. Answer based on the precise production logging configuration visible in those dashboards.

Third-party providers disclosed in policy: Supabase, Vercel, and Google Gmail infrastructure for reminders. The released app does not send user data to third-party AI, transcription, search, iTunes, or Apple Music services.
