export const AI_SHARING_NOTICE = "Unravel does not send journal entries, moods, feelings, labels, profile preferences, or voice recordings to any third-party AI service. Advice and song suggestions are selected from content bundled with the app. Voice transcription and personalized web search are not offered.";

export const AI_SUGGESTIONS_SUMMARY = "Private suggestions selected from content bundled with Unravel.";

export const AI_SUGGESTIONS_CONSENT = AI_SHARING_NOTICE;

export const CRISIS_HELP = "Unravel is not an emergency service. If you may be in danger or are thinking about harming yourself or someone else, call your local emergency number now. In the U.S. or Canada, call or text 988. Elsewhere, find a local crisis line at findahelpline.com.";
export const CRISIS_HELP_URL = "https://findahelpline.com";

export const PRIVACY_UPDATED = "October 31, 2026";

export const PRIVACY_SECTIONS = [
  { title: "What Unravel collects", text: "When you create an account, Unravel collects your email address and authentication information. When you use the app, it stores the journal content you choose to provide: written entries, voice recordings, moods, energy, feelings, prompts, labels, addenda, saved aftercare, preferences, onboarding answers, reminder settings and app settings. The service also receives ordinary technical request data such as IP address, device and browser information, timestamps and error details." },
  { title: "How it is collected and used", text: "You provide account details, journal content and preferences directly. Unravel uses them to authenticate you, synchronize and display your private journal, play your recordings, remember settings, provide reminders, support export and deletion, and operate and secure the service. Advice, reading and song suggestions use rules and content bundled with Unravel. Journal content is not used for advertising, sold, or used to train AI models." },
  { title: "No third-party AI sharing", text: AI_SHARING_NOTICE },
  { title: "Service providers", text: "Supabase provides authentication, database, file storage and server functions and therefore processes account details, journal data, recordings and technical request data for Unravel. Vercel hosts the website and processes ordinary web request and diagnostic data. Google Gmail infrastructure sends reminder email and processes the recipient email address and reminder message. These providers act only to provide the service under their applicable contractual and privacy protections. Unravel does not permit them to use journal content for advertising or AI training." },
  { title: "Links and external services", text: "Reading items and crisis resources may link to websites outside Unravel. Those sites receive data such as your IP address when you choose to open them and operate under their own policies. Unravel does not send your journal text or profile to those sites. The released app does not send artist searches or journal data to Apple Music, iTunes, a web-search provider or an AI provider." },
  { title: "Microphone and notifications", text: "Microphone access is requested only when you choose to record a voice memo. The recording is uploaded to your private journal storage so you can play it back; it is not sent to an AI or transcription service. Notification permission is used only for reminders you configure." },
  { title: "Storage, security and retention", text: "Journal data is associated with your account and stored by Supabase. Data is encrypted in transit and protected by account access controls, but it is not end-to-end encrypted. Recently deleted entries may remain recoverable for up to seven days. Provider backups and security logs may remain for limited periods under provider retention practices. No method of storage is completely risk-free." },
  { title: "Your choices and deletion", text: "You may decline microphone or notification access and continue using other features. You can export your journal, delete individual entries, permanently remove recently deleted entries, or delete your account in Settings → Account. Account deletion removes the authentication account, associated active database records and stored voice recordings. Exports you already downloaded and limited provider backups or security logs are not controlled by that in-app action." },
  { title: "Wellbeing and audience", text: "Unravel is a journaling and general wellbeing app, not a medical service, diagnosis, treatment or emergency service. Automated on-device suggestions may not fit every situation. The app is not submitted in Apple's Made for Kids category." },
  { title: "Contact", text: "For privacy questions or requests, use the support contact listed on Unravel's App Store page or the Support page in the app." },
];

