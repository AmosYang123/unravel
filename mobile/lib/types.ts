export type EntryMode = "longform" | "short" | "bullets" | "voice" | "mood" | "prompt" | "gratitude";

/**
 * The aftercare shapes live here, not in the content/music helpers, because an
 * entry stores what it was actually shown and those files already import from
 * here. They are type aliases rather than interfaces so they stay assignable to
 * the generated `Json` type when written to a jsonb column.
 */
export type SupportPlan = {
  headline: string;
  encouragement: string;
  steps: string[];
  basis: string;
};

export type SongSuggestion = {
  id: string;
  title: string;
  artist: string;
  genre: string;
  reason: string;
  url?: string;
  previewUrl?: string | null;
  albumArt?: string | null;
  releasedAt?: string | null;
  note?: string;
};

export type SongSuggestions = {
  picks: SongSuggestion[];
  basis: string;
  source: "deezer" | "offline";
};

/** One "add something" note. The entry's original text is never rewritten. */
export type Addendum = {
  text: string;
  /** ISO, when this note was added — not when the entry was written. */
  addedAt: string;
};

export interface Entry {
  id: string;
  createdAt: string; // ISO
  mode: EntryMode;
  mood: number; // 1..5
  energy: number; // 1..5
  feelings: string[];
  title?: string;
  text?: string;
  bullets?: string[];
  prompt?: string;
  gratitude?: string[];
  audioPath?: string;
  audioSeconds?: number;
  transcript?: string;
  transcriptSummary?: string;
  transcriptStatus?: "none" | "done";
  songId?: string;
  breathed?: boolean;
  /** Answers to this format's pre-writing sliders, one string per slider. */
  intent?: string[];
  /** The support plan this entry was actually given. */
  advice?: SupportPlan;
  /** The song picks this entry was actually given. */
  songs?: SongSuggestions;
  /** Quiet bookmark. Absent means not kept. */
  kept?: boolean;
  /** ISO. Set means soft-deleted and recoverable; absent means live. */
  deletedAt?: string;
  /** Later additions, oldest first. Appending one never touches `createdAt`. */
  addenda?: Addendum[];
}

export type NewEntry = Omit<Entry, "id" | "createdAt"> & { createdAt?: string };

export type ThemeName = "system" | "linen" | "blush" | "mist" | "sage" | "lilac" | "dusk" | "ink";

/**
 * Where someone is up to at school, asked once during onboarding. Stored as a
 * plain id; the labels and the order they are offered in live in onboarding.ts.
 */
export type YearLevel = "prep" | "lower" | "upper" | "senior";

export interface Settings {
  name: string;
  theme: ThemeName;
  displayFont: string;
  bodyFont: string;
  reminderMode: "manual" | "daily" | "days" | "weekly" | "monthly";
  reminderDays: number[]; // 0..6
  reminderTime: string;
  reminderEmails: boolean;
  timezone: string;
  discreetNotifications: boolean;
  insightsEnabled: boolean;
  aiSuggestionsEnabled: boolean;
  lockEnabled: boolean;
  passcode: string;
  musicTastes: string[];
  musicArtists: string[];
  showMoodInHistory: boolean;
  /** Empty means they didn't say — nothing here is required. */
  yearLevel: YearLevel | "";
  /** What's on their plate right now, as ids from FOCUS_AREAS. */
  focusAreas: string[];
  /** What they'd like from the app, as ids from GOALS. */
  goals: string[];
  /** Hobbies and interests, free entry, exactly as typed. */
  interests: string[];
  /** ISO, stamped once the first-run questions are finished or skipped. Empty means not yet. */
  onboardedAt: string;
}
