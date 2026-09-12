import { useCallback, useEffect, useReducer } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { Addendum, Entry, NewEntry, Settings, SongSuggestion, SongSuggestions, SupportPlan, ThemeName } from "./types";
import { isYearLevel } from "./onboarding";

type EntryInsert = Database["public"]["Tables"]["entries"]["Insert"];
type EntryUpdate = Database["public"]["Tables"]["entries"]["Update"];
type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];

const LEGACY_ENTRIES_KEY = "quiet.entries.v1";
const LEGACY_SETTINGS_KEY = "quiet.settings.v1";
const AUDIO_BUCKET = "voice-memos";

/** How long a soft-deleted entry stays recoverable before it goes for good. */
const TRASH_RETENTION_DAYS = 7;

export const defaultSettings: Settings = {
  name: "",
  theme: "linen",
  displayFont: "Fraunces",
  bodyFont: "Karla",
  reminderMode: "days",
  reminderDays: [1, 3, 5],
  reminderTime: "21:00",
  reminderEmails: true,
  timezone: "UTC",
  discreetNotifications: true,
  insightsEnabled: true,
  aiSuggestionsEnabled: false,
  lockEnabled: false,
  passcode: "",
  musicTastes: [],
  musicArtists: [],
  showMoodInHistory: true,
  yearLevel: "",
  focusAreas: [],
  goals: [],
  interests: [],
  onboardedAt: "",
};

const THEMES: ThemeName[] = ["linen", "blush", "mist", "sage", "lilac", "dusk", "ink"];

/* ---------- row mapping ---------- */

type EntryRow = {
  id: string;
  created_at: string;
  mode: string;
  mood: number;
  energy: number;
  feelings: string[] | null;
  title: string | null;
  body: string | null;
  bullets: string[] | null;
  prompt: string | null;
  gratitude: string[] | null;
  audio_path: string | null;
  audio_seconds: number | null;
  transcript: string | null;
  transcript_summary: string | null;
  transcript_status: string | null;
  song_id: string | null;
  breathed: boolean | null;
  intent: string[] | null;
  advice: unknown;
  songs: unknown;
  kept: boolean | null;
  deleted_at: string | null;
  addenda: unknown;
};

/* jsonb comes back as `unknown`, so the aftercare shapes are narrowed on the
   way out rather than trusted. A row that does not match is read as absent. */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asString = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

const toAdvice = (value: unknown): SupportPlan | undefined => {
  if (!isRecord(value)) return undefined;
  const { headline, encouragement, steps, basis } = value;
  if (typeof headline !== "string" || typeof encouragement !== "string") return undefined;
  if (!isStringArray(steps) || typeof basis !== "string") return undefined;
  return { headline, encouragement, steps, basis };
};

const toSongPick = (value: unknown): SongSuggestion | null => {
  if (!isRecord(value)) return null;
  const { id, title, artist, genre, reason } = value;
  if (typeof id !== "string" || typeof title !== "string" || typeof artist !== "string") return null;
  if (typeof genre !== "string" || typeof reason !== "string") return null;
  return {
    id,
    title,
    artist,
    genre,
    reason,
    url: asString(value.url),
    previewUrl: asString(value.previewUrl) ?? null,
    albumArt: asString(value.albumArt) ?? null,
    releasedAt: asString(value.releasedAt) ?? null,
    note: asString(value.note),
  };
};

const toSongs = (value: unknown): SongSuggestions | undefined => {
  if (!isRecord(value)) return undefined;
  const { picks, basis, source } = value;
  if (!Array.isArray(picks) || typeof basis !== "string") return undefined;
  if (source !== "deezer" && source !== "offline") return undefined;
  return {
    picks: picks.map(toSongPick).filter((pick): pick is SongSuggestion => pick !== null),
    basis,
    source,
  };
};

const toAddendum = (value: unknown): Addendum | null => {
  if (!isRecord(value)) return null;
  const { text, addedAt } = value;
  if (typeof text !== "string" || typeof addedAt !== "string") return null;
  return { text, addedAt };
};

const toAddenda = (value: unknown): Addendum[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  return value.map(toAddendum).filter((item): item is Addendum => item !== null);
};

const toEntry = (row: EntryRow): Entry => ({
  id: row.id,
  createdAt: row.created_at,
  mode: row.mode as Entry["mode"],
  mood: row.mood,
  energy: row.energy,
  feelings: row.feelings ?? [],
  title: row.title ?? undefined,
  text: row.body ?? undefined,
  bullets: row.bullets ?? undefined,
  prompt: row.prompt ?? undefined,
  gratitude: row.gratitude ?? undefined,
  audioPath: row.audio_path ?? undefined,
  audioSeconds: row.audio_seconds ?? undefined,
  transcript: row.transcript ?? undefined,
  transcriptSummary: row.transcript_summary ?? undefined,
  transcriptStatus: (row.transcript_status as Entry["transcriptStatus"]) ?? "none",
  songId: row.song_id ?? undefined,
  breathed: row.breathed ?? false,
  intent: row.intent ?? undefined,
  advice: toAdvice(row.advice),
  songs: toSongs(row.songs),
  kept: row.kept ?? false,
  deletedAt: row.deleted_at ?? undefined,
  addenda: toAddenda(row.addenda),
});

/** Newest first, the order the journal is read in everywhere. */
const byNewest = (a: Entry, b: Entry) => b.createdAt.localeCompare(a.createdAt);

const toEntryRow = (patch: Partial<Entry>): EntryUpdate => {
  const row: EntryUpdate = {};
  if ("createdAt" in patch) row.created_at = patch.createdAt;
  if ("mode" in patch) row.mode = patch.mode;
  if ("mood" in patch) row.mood = patch.mood;
  if ("energy" in patch) row.energy = patch.energy;
  if ("feelings" in patch) row.feelings = patch.feelings ?? [];
  if ("title" in patch) row.title = patch.title ?? null;
  if ("text" in patch) row.body = patch.text ?? null;
  if ("bullets" in patch) row.bullets = patch.bullets ?? null;
  if ("prompt" in patch) row.prompt = patch.prompt ?? null;
  if ("gratitude" in patch) row.gratitude = patch.gratitude ?? null;
  if ("audioPath" in patch) row.audio_path = patch.audioPath ?? null;
  if ("audioSeconds" in patch) row.audio_seconds = patch.audioSeconds ?? null;
  if ("transcript" in patch) row.transcript = patch.transcript ?? null;
  if ("transcriptSummary" in patch) row.transcript_summary = patch.transcriptSummary ?? null;
  if ("transcriptStatus" in patch) row.transcript_status = patch.transcriptStatus ?? "none";
  if ("songId" in patch) row.song_id = patch.songId ?? null;
  if ("breathed" in patch) row.breathed = patch.breathed ?? false;
  if ("intent" in patch) row.intent = patch.intent ?? null;
  if ("advice" in patch) row.advice = patch.advice ?? null;
  if ("songs" in patch) row.songs = patch.songs ?? null;
  if ("kept" in patch) row.kept = patch.kept ?? false;
  if ("deletedAt" in patch) row.deleted_at = patch.deletedAt ?? null;
  if ("addenda" in patch) row.addenda = patch.addenda ?? null;
  return row;
};

type ProfileRow = {
  name: string | null;
  theme: string | null;
  display_font: string | null;
  body_font: string | null;
  reminder_mode: string | null;
  reminder_days: number[] | null;
  reminder_time: string | null;
  reminder_email_enabled: boolean | null;
  timezone: string | null;
  discreet_notifications: boolean | null;
  insights_enabled: boolean | null;
  ai_suggestions_enabled: boolean | null;
  ai_consent_version?: string | null;
  lock_enabled: boolean | null;
  passcode: string | null;
  music_tastes: string[] | null;
  music_artists: string[] | null;
  show_mood_in_history: boolean | null;
  year_level: string | null;
  focus_areas: string[] | null;
  goals: string[] | null;
  interests: string[] | null;
  onboarded_at: string | null;
};

const toSettings = (row: ProfileRow): Settings => ({
  name: row.name ?? "",
  theme: THEMES.includes(row.theme as ThemeName) ? (row.theme as ThemeName) : "linen",
  displayFont: row.display_font || "Fraunces",
  bodyFont: row.body_font || "Karla",
  reminderMode: (row.reminder_mode as Settings["reminderMode"]) ?? "days",
  reminderDays: row.reminder_days ?? [1, 3, 5],
  reminderTime: row.reminder_time || "21:00",
  reminderEmails: row.reminder_email_enabled ?? true,
  timezone: row.timezone || "UTC",
  discreetNotifications: row.discreet_notifications ?? true,
  insightsEnabled: row.insights_enabled ?? true,
  aiSuggestionsEnabled: row.ai_suggestions_enabled === true && row.ai_consent_version === "2026-09-11",
  lockEnabled: row.lock_enabled ?? false,
  passcode: row.passcode ?? "",
  musicTastes: row.music_tastes ?? [],
  musicArtists: row.music_artists ?? [],
  showMoodInHistory: row.show_mood_in_history ?? true,
  // All five are null on every profile written before onboarding existed, and
  // stay null for anyone who skips, so each falls back to "not said".
  yearLevel: isYearLevel(row.year_level) ? row.year_level : "",
  focusAreas: row.focus_areas ?? [],
  goals: row.goals ?? [],
  interests: row.interests ?? [],
  onboardedAt: row.onboarded_at ?? "",
});

const toProfileRow = (patch: Partial<Settings>): ProfileUpdate => {
  const row: ProfileUpdate = {};
  if ("name" in patch) row.name = patch.name ?? "";
  if ("theme" in patch) row.theme = patch.theme;
  if ("displayFont" in patch) row.display_font = patch.displayFont;
  if ("bodyFont" in patch) row.body_font = patch.bodyFont;
  if ("reminderMode" in patch) row.reminder_mode = patch.reminderMode;
  if ("reminderDays" in patch) row.reminder_days = patch.reminderDays;
  if ("reminderTime" in patch) row.reminder_time = patch.reminderTime;
  if ("reminderEmails" in patch) row.reminder_email_enabled = patch.reminderEmails;
  if ("timezone" in patch) row.timezone = patch.timezone;
  if ("discreetNotifications" in patch) row.discreet_notifications = patch.discreetNotifications;
  if ("insightsEnabled" in patch) row.insights_enabled = patch.insightsEnabled;
  if ("aiSuggestionsEnabled" in patch) {
    row.ai_suggestions_enabled = patch.aiSuggestionsEnabled;
    row.ai_consent_version = patch.aiSuggestionsEnabled ? "2026-09-11" : null;
  }
  if ("lockEnabled" in patch) row.lock_enabled = patch.lockEnabled;
  if ("passcode" in patch) row.passcode = patch.passcode ?? "";
  if ("musicTastes" in patch) row.music_tastes = patch.musicTastes;
  if ("musicArtists" in patch) row.music_artists = patch.musicArtists;
  if ("showMoodInHistory" in patch) row.show_mood_in_history = patch.showMoodInHistory;
  // "" is how the client says "not answered", and null is how the column says
  // it, so the two empties are kept in step rather than storing a blank string.
  if ("yearLevel" in patch) row.year_level = patch.yearLevel || null;
  if ("focusAreas" in patch) row.focus_areas = patch.focusAreas;
  if ("goals" in patch) row.goals = patch.goals;
  if ("interests" in patch) row.interests = patch.interests;
  if ("onboardedAt" in patch) row.onboarded_at = patch.onboardedAt || null;
  return row;
};

/* ---------- tiny external store ---------- */

interface StoreState {
  userId: string | null;
  loading: boolean;
  error: string | null;
  /** The pages of the live journal loaded so far, newest first. */
  entries: Entry[];
  /** `created_at` of the oldest loaded entry — where the next page starts. */
  entriesCursor: string | null;
  /** How many live entries the user actually has, which is more than are loaded. */
  entryCount: number;
  /** Whether there are older live entries still to fetch. */
  hasMore: boolean;
  loadingMore: boolean;
  /** Soft-deleted entries, newest first. Never mixed into `entries`. */
  deletedEntries: Entry[];
  settings: Settings;
}

/**
 * How many live entries load at a time, at sign-in and on each `loadMore`.
 * Rows are fat (body text, transcripts, two jsonb columns), so a small page
 * keeps the first paint cheap; 50 still fills several screens of the Timeline.
 */
export const ENTRY_PAGE_SIZE = 50;

/** Bigger pages for the whole-history reads (export, audio cleanup): fewer round trips, no UI waiting on each one. */
const BULK_PAGE_SIZE = 500;

/** The bin is a short, self-emptying list shown in full, so it still loads in one go. */
const TRASH_LIMIT = 500;

let state: StoreState = {
  userId: null,
  loading: true,
  error: null,
  entries: [],
  entriesCursor: null,
  entryCount: 0,
  hasMore: false,
  loadingMore: false,
  deletedEntries: [],
  settings: defaultSettings,
};
const listeners = new Set<() => void>();
const set = (patch: Partial<StoreState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

function useStore(): StoreState {
  const [, bump] = useReducer((c: number) => c + 1, 0);
  useEffect(() => {
    listeners.add(bump);
    return () => {
      listeners.delete(bump);
    };
  }, [bump]);
  return state;
}

let loadGeneration = 0;

export async function loadUserData(userId: string) {
  const generation = ++loadGeneration;
  set({ userId, loading: true, error: null });

  try {
    // Live and soft-deleted are read separately so a full bin can never eat
    // into the live journal's page. Both go out with the profile fetch, so it
    // is still one round trip. The live read is what the partial index covers,
    // and it is only the first page — older entries arrive through `loadMore`.
    const [profileRes, entriesRes, deletedRes, countRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase
        .from("entries")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(ENTRY_PAGE_SIZE),
      supabase
        .from("entries")
        .select("*")
        .not("deleted_at", "is", null)
        .order("created_at", { ascending: false })
        .limit(TRASH_LIMIT),
      // How many entries the user has, counted in the database rather than by
      // fetching rows, since only the first page of them is loaded.
      supabase.from("entries").select("id", { count: "exact", head: true }).is("deleted_at", null),
    ]);

    if (generation !== loadGeneration) return;
    if (profileRes.error) throw new Error(profileRes.error.message);
    if (entriesRes.error) throw new Error(entriesRes.error.message);
    if (deletedRes.error) throw new Error(deletedRes.error.message);
    if (countRes.error) throw new Error(countRes.error.message);

    let settings = defaultSettings;
    if (profileRes.data) {
      settings = toSettings(profileRes.data as ProfileRow);
    } else {
      // Safety net if the signup trigger has not landed yet.
      const inserted = await supabase.from("profiles").insert({ id: userId }).select().maybeSingle();
      if (inserted.error) throw new Error(inserted.error.message);
      // The trigger may have won the race, so prefer whatever row now exists.
      if (inserted.data) settings = toSettings(inserted.data as ProfileRow);
    }

    // Keep the stored time zone current so reminders land at the right local hour.
    const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (localZone && localZone !== settings.timezone) {
      const zoneRes = await supabase.from("profiles").update({ timezone: localZone }).eq("id", userId);
      if (zoneRes.error) throw new Error(zoneRes.error.message);
      settings = { ...settings, timezone: localZone };
    }

    if (generation !== loadGeneration) return;
    const deletedEntries = ((deletedRes.data as EntryRow[] | null) ?? []).map(toEntry);
    const liveRows = (entriesRes.data as EntryRow[] | null) ?? [];

    set({
      settings,
      entries: liveRows.map(toEntry),
      entriesCursor: liveRows.length ? liveRows[liveRows.length - 1].created_at : null,
      entryCount: countRes.count ?? liveRows.length,
      hasMore: liveRows.length === ENTRY_PAGE_SIZE,
      deletedEntries,
      error: null,
    });

    // Best effort: expired soft-deletes go for good, but never at the cost of
    // the journal loading.
    void purgeExpiredDeletes(userId, deletedEntries).catch(() => undefined);
  } catch (err) {
    if (generation === loadGeneration) set({ error: err instanceof Error ? err.message : "Could not load your journal." });
  } finally {
    if (generation === loadGeneration) set({ loading: false });
  }
}

/** Permanently drops soft-deletes past the retention window, audio included. */
async function purgeExpiredDeletes(userId: string, deleted: Entry[]) {
  const cutoff = Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const expired = deleted.filter((e) => e.deletedAt && new Date(e.deletedAt).getTime() < cutoff);
  if (!expired.length) return;

  const ids = expired.map((e) => e.id);
  // Row first: a failed delete must not leave an entry whose audio is already gone.
  const { error } = await supabase.from("entries").delete().in("id", ids).eq("user_id", userId);
  if (error) throw new Error(error.message);
  const paths = expired.map((e) => e.audioPath).filter(Boolean) as string[];
  if (paths.length) await supabase.storage.from(AUDIO_BUCKET).remove(paths);
  set({ deletedEntries: state.deletedEntries.filter((e) => !ids.includes(e.id)) });
}

export function clearUserData() {
  loadGeneration += 1;
  // Legacy prototype keys are not namespaced per user and hold entry text and a passcode.
  try {
    localStorage.removeItem(LEGACY_ENTRIES_KEY);
    localStorage.removeItem(LEGACY_SETTINGS_KEY);
  } catch {
    // Storage can be unavailable (private mode); local state still gets cleared below.
  }
  state = {
    userId: null,
    loading: false,
    error: null,
    entries: [],
    entriesCursor: null,
    entryCount: 0,
    hasMore: false,
    loadingMore: false,
    deletedEntries: [],
    settings: defaultSettings,
  };
  listeners.forEach((l) => l());
}

/* ---------- entries ---------- */

export async function uploadVoiceMemo(userId: string, blob: Blob, mimeType: string): Promise<string> {
  const ext = mimeType.includes("mp4") ? "mp4" : mimeType.includes("ogg") ? "ogg" : mimeType.includes("wav") ? "wav" : "webm";
  const path = `${userId}/${uid()}.${ext}`;
  const { error } = await supabase.storage
    .from(AUDIO_BUCKET)
    .upload(path, blob, { contentType: mimeType || "audio/webm", upsert: false });
  if (error) throw new Error(error.message);
  return path;
}

export async function signedAudioUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from(AUDIO_BUCKET).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

/* ---------- reads that go past the loaded pages ---------- */

/** What the Timeline can narrow by. Everything is optional; omitted means "no filter". */
export interface EntryFilters {
  /** Free text, matched case-insensitively against `search_text` — the generated column
      flattening title, body, transcript, summary, bullets, gratitude and feelings. */
  search?: string;
  /** A single format, e.g. `"voice"`. Omit for all formats. */
  mode?: Entry["mode"];
  /** Feeling tags; an entry matches when it carries any of them, as the Timeline's chips do. */
  feelings?: string[];
  /** True to return only bookmarked entries. False and undefined both mean "no filter". */
  keptOnly?: boolean;
  /** One local calendar day as `YYYY-MM-DD`, read in the browser's time zone. */
  day?: string;
}

export interface EntryPage {
  /** The requested page, newest first. */
  entries: Entry[];
  /** Whether a further page exists after this one. */
  hasMore: boolean;
}

/**
 * LIKE treats `%` and `_` as wildcards and PostgREST reads `,` `.` and `(` as
 * syntax, so a search term is escaped for both before it goes into a filter.
 */
const toIlikePattern = (term: string) => {
  const escaped = term.replace(/[\\%_]/g, (c) => `\\${c}`);
  return `"%${escaped.replace(/["\\]/g, (c) => `\\${c}`)}%"`;
};

/** The instants bounding a local `YYYY-MM-DD` day, for a timestamptz range. */
const dayBounds = (day: string): [string, string] | null => {
  const [year, month, date] = day.split("-").map(Number);
  if (!year || !month || !date) return null;
  const start = new Date(year, month - 1, date);
  const end = new Date(year, month - 1, date + 1);
  return [start.toISOString(), end.toISOString()];
};

/**
 * Runs the Timeline's filters and search in Postgres rather than over the
 * loaded pages, so narrowing searches the whole journal. Newest first,
 * soft-deleted rows excluded, `page` zero-based.
 */
export async function queryEntries(
  filters: EntryFilters,
  page = 0,
  pageSize = ENTRY_PAGE_SIZE,
): Promise<EntryPage> {
  let query = supabase
    .from("entries")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (filters.mode) query = query.eq("mode", filters.mode);
  if (filters.keptOnly) query = query.eq("kept", true);
  if (filters.feelings?.length) query = query.overlaps("feelings", filters.feelings);
  if (filters.day) {
    const bounds = dayBounds(filters.day);
    if (bounds) query = query.gte("created_at", bounds[0]).lt("created_at", bounds[1]);
  }
  // One `ilike` on the generated `search_text` column, the shape its trigram index
  // covers. Written as a raw filter so the escaped, quoted pattern is parsed by
  // PostgREST rather than sent literally.
  const term = filters.search?.trim();
  if (term) query = query.or(`search_text.ilike.${toIlikePattern(term)}`);

  // One row past the page answers "is there more?" without a second count query.
  const from = page * pageSize;
  const { data, error } = await query.range(from, from + pageSize);
  if (error) throw new Error(error.message);
  const rows = (data as EntryRow[] | null) ?? [];
  return { entries: rows.slice(0, pageSize).map(toEntry), hasMore: rows.length > pageSize };
}

/** One entry straight from the database, for a link opened before its page has loaded. */
export async function fetchEntry(id: string): Promise<Entry | null> {
  const { data, error } = await supabase
    .from("entries")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toEntry(data as EntryRow) : null;
}

/** Every live entry, newest first, paged through — what an export has to be built from. */
export async function fetchAllEntries(): Promise<Entry[]> {
  const fetchPage = async (cursor: string | null): Promise<EntryRow[]> => {
    const base = supabase
      .from("entries")
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(BULK_PAGE_SIZE);
    const { data, error } = await (cursor ? base.lt("created_at", cursor) : base);
    if (error) throw new Error(error.message);
    return (data as EntryRow[] | null) ?? [];
  };

  const all: Entry[] = [];
  let cursor: string | null = null;
  for (;;) {
    const rows = await fetchPage(cursor);
    all.push(...rows.map(toEntry));
    if (rows.length < BULK_PAGE_SIZE) return all;
    cursor = rows[rows.length - 1].created_at;
  }
}

/** Every audio path the user has, soft-deleted rows included, so a full wipe leaves no orphans. */
async function fetchAllAudioPaths(): Promise<string[]> {
  type AudioRow = { created_at: string; audio_path: string | null };
  const fetchPage = async (cursor: string | null): Promise<AudioRow[]> => {
    const base = supabase
      .from("entries")
      .select("created_at, audio_path")
      .not("audio_path", "is", null)
      .order("created_at", { ascending: false })
      .limit(BULK_PAGE_SIZE);
    const { data, error } = await (cursor ? base.lt("created_at", cursor) : base);
    if (error) throw new Error(error.message);
    return (data as AudioRow[] | null) ?? [];
  };

  const paths: string[] = [];
  let cursor: string | null = null;
  for (;;) {
    const rows = await fetchPage(cursor);
    for (const row of rows) if (row.audio_path) paths.push(row.audio_path);
    if (rows.length < BULK_PAGE_SIZE) return paths;
    cursor = rows[rows.length - 1].created_at;
  }
}

export function useEntries() {
  const { entries, deletedEntries, loading, error, userId, entryCount, hasMore, loadingMore } = useStore();

  const addEntry = useCallback(
    async (draft: NewEntry): Promise<Entry> => {
      if (!userId || userId !== state.userId) throw new Error("Not signed in.");
      const generation = loadGeneration;
      const assertCurrent = () => {
        if (generation !== loadGeneration || userId !== state.userId) throw new Error("Your account changed. Please reopen this screen.");
      };
      const { data, error } = await supabase
        .from("entries")
        .insert({ ...toEntryRow(draft as Partial<Entry>), user_id: userId } as EntryInsert)
        .select("*")
        .single();
      assertCurrent();
      if (error) throw new Error(error.message);
      const entry = toEntry(data as EntryRow);
      set({ entries: [entry, ...state.entries], entryCount: state.entryCount + 1 });
      return entry;
    },
    [userId],
  );

  /** The next page of older entries, appended. Keyed off the oldest one loaded, not an offset,
      so entries written or deleted meanwhile cannot shift the page boundary. */
  const loadMore = useCallback(async () => {
    if (!userId || userId !== state.userId || state.loadingMore || !state.hasMore || !state.entriesCursor) return;
    const generation = loadGeneration;
    const assertCurrent = () => {
      if (generation !== loadGeneration || userId !== state.userId) throw new Error("Your account changed. Please reopen this screen.");
    };
    set({ loadingMore: true });
    try {
      const { data, error } = await supabase
        .from("entries")
        .select("*")
        .is("deleted_at", null)
        .lt("created_at", state.entriesCursor)
        .order("created_at", { ascending: false })
        .limit(ENTRY_PAGE_SIZE);
      assertCurrent();
      if (error) throw new Error(error.message);
      const rows = (data as EntryRow[] | null) ?? [];
      const seen = new Set(state.entries.map((e) => e.id));
      set({
        entries: [...state.entries, ...rows.map(toEntry).filter((e) => !seen.has(e.id))],
        entriesCursor: rows.length ? rows[rows.length - 1].created_at : state.entriesCursor,
        hasMore: rows.length === ENTRY_PAGE_SIZE,
      });
    } finally {
      if (generation === loadGeneration) set({ loadingMore: false });
    }
  }, [userId]);

  const updateEntry = useCallback(async (id: string, patch: Partial<Entry>) => {
    if (!userId || userId !== state.userId) throw new Error("Not signed in.");
    const generation = loadGeneration;
    const assertCurrent = () => {
      if (generation !== loadGeneration || userId !== state.userId) throw new Error("Your account changed. Please reopen this screen.");
    };
    const { error } = await supabase
      .from("entries")
      .update(toEntryRow(patch))
      .eq("id", id)
      .eq("user_id", userId);
    assertCurrent();
    if (error) throw new Error(error.message);
    set({ entries: state.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
  }, [userId]);

  const setKept = useCallback(
    (id: string, kept: boolean) => updateEntry(id, { kept }),
    [updateEntry],
  );

  /** Soft delete: the entry leaves the journal but stays recoverable, audio and all. */
  const removeEntry = useCallback(async (id: string) => {
    if (!userId || userId !== state.userId) throw new Error("Not signed in.");
    const generation = loadGeneration;
    const assertCurrent = () => {
      if (generation !== loadGeneration || userId !== state.userId) throw new Error("Your account changed. Please reopen this screen.");
    };
    // Older entries can be open on their own page without being loaded here.
    const entry = state.entries.find((e) => e.id === id) ?? (await fetchEntry(id));
    if (!entry) return;
    assertCurrent();
    const deletedAt = new Date().toISOString();
    const { error } = await supabase
      .from("entries")
      .update(toEntryRow({ deletedAt }))
      .eq("id", id)
      .eq("user_id", userId);
    assertCurrent();
    if (error) throw new Error(error.message);
    set({
      entries: state.entries.filter((e) => e.id !== id),
      deletedEntries: [...state.deletedEntries, { ...entry, deletedAt }].sort(byNewest),
      entryCount: Math.max(0, state.entryCount - 1),
    });
  }, [userId]);

  const restoreEntry = useCallback(async (id: string) => {
    if (!userId || userId !== state.userId) throw new Error("Not signed in.");
    const generation = loadGeneration;
    const assertCurrent = () => {
      if (generation !== loadGeneration || userId !== state.userId) throw new Error("Your account changed. Please reopen this screen.");
    };
    const entry = state.deletedEntries.find((e) => e.id === id);
    if (!entry) return;
    const { error } = await supabase
      .from("entries")
      .update(toEntryRow({ deletedAt: undefined }))
      .eq("id", id)
      .eq("user_id", userId);
    assertCurrent();
    if (error) throw new Error(error.message);
    set({
      entries: [...state.entries, { ...entry, deletedAt: undefined }].sort(byNewest),
      deletedEntries: state.deletedEntries.filter((e) => e.id !== id),
      entryCount: state.entryCount + 1,
    });
  }, [userId]);

  /** Permanent: no way back from here. */
  const purgeEntry = useCallback(async (id: string) => {
    if (!userId || userId !== state.userId) throw new Error("Not signed in.");
    const generation = loadGeneration;
    const assertCurrent = () => {
      if (generation !== loadGeneration || userId !== state.userId) throw new Error("Your account changed. Please reopen this screen.");
    };
    const entry =
      state.deletedEntries.find((e) => e.id === id) ??
      state.entries.find((e) => e.id === id) ??
      (await fetchEntry(id));
    assertCurrent();
    // Row first: a failed delete must not leave an entry whose audio is already gone.
    const { error } = await supabase
      .from("entries")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);
    assertCurrent();
    if (error) throw new Error(error.message);
    if (entry?.audioPath) await supabase.storage.from(AUDIO_BUCKET).remove([entry.audioPath]);
    assertCurrent();
    // Purging from the bin does not change the live total; purging a live entry does.
    const wasLive = Boolean(entry && !entry.deletedAt);
    set({
      entries: state.entries.filter((e) => e.id !== id),
      deletedEntries: state.deletedEntries.filter((e) => e.id !== id),
      entryCount: wasLive ? Math.max(0, state.entryCount - 1) : state.entryCount,
    });
  }, [userId]);

  const clearAll = useCallback(async () => {
    if (!userId || userId !== state.userId) return;
    const generation = loadGeneration;
    const assertCurrent = () => {
      if (generation !== loadGeneration || userId !== state.userId) throw new Error("Your account changed. Please reopen this screen.");
    };
    // "Delete all entries" means all of them, soft-deleted and not-yet-loaded ones
    // included, so the audio paths are read from the database rather than memory.
    const paths = await fetchAllAudioPaths();
    assertCurrent();
    const { error } = await supabase.from("entries").delete().eq("user_id", userId);
    assertCurrent();
    if (error) throw new Error(error.message);
    if (paths.length) await supabase.storage.from(AUDIO_BUCKET).remove(paths);
    assertCurrent();
    set({ entries: [], entriesCursor: null, entryCount: 0, hasMore: false, deletedEntries: [] });
  }, [userId]);

  return {
    entries,
    deletedEntries,
    loading,
    error,
    userId,
    entryCount,
    hasMore,
    loadingMore,
    loadMore,
    addEntry,
    updateEntry,
    setKept,
    removeEntry,
    restoreEntry,
    purgeEntry,
    clearAll,
  };
}

/* ---------- settings ---------- */

export function useSettings() {
  const { settings, loading, error } = useStore();

  const update = useCallback(async (patch: Partial<Settings>) => {
    if (!state.userId) return;
    const userId = state.userId;
    const generation = loadGeneration;
    const { error } = await supabase.from("profiles").update(toProfileRow(patch)).eq("id", userId);
    if (error) throw new Error(error.message);
    if (state.userId === userId && generation === loadGeneration) {
      set({ settings: { ...state.settings, ...patch } });
    }
  }, []);

  return { settings, loading, error, update };
}

/**
 * The settings as they stand right now, for the code outside React that still
 * has to know who is writing (the advice prompt builder). Not a substitute for
 * useSettings inside a component: reading this re-renders nothing.
 */
export function currentSettings(): Settings {
  return state.settings;
}

/* ---------- one-time import of prototype data from this browser ---------- */

export function legacyLocalEntryCount(): number {
  try {
    const raw = localStorage.getItem(LEGACY_ENTRIES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

export async function importLegacyLocalData(): Promise<number> {
  if (!state.userId) return 0;
  let imported = 0;
  const raw = localStorage.getItem(LEGACY_ENTRIES_KEY);
  const legacy: (Entry & { audioDataUrl?: string })[] = raw ? JSON.parse(raw) : [];
  for (const old of legacy.reverse()) {
    let audioPath: string | undefined;
    if (old.audioDataUrl?.startsWith("data:")) {
      const blob = await (await fetch(old.audioDataUrl)).blob();
      audioPath = await uploadVoiceMemo(state.userId, blob, blob.type);
    }
    const { data, error } = await supabase
      .from("entries")
      .insert({
        ...toEntryRow({ ...old, audioPath }),
        created_at: old.createdAt,
        user_id: state.userId,
      } as EntryInsert)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    set({ entries: [toEntry(data as EntryRow), ...state.entries], entryCount: state.entryCount + 1 });
    imported += 1;
  }

  const rawSettings = localStorage.getItem(LEGACY_SETTINGS_KEY);
  if (rawSettings) {
    const legacySettings = JSON.parse(rawSettings) as Partial<Settings>;
    delete legacySettings.passcode;
    const { error } = await supabase.from("profiles").update(toProfileRow({ ...legacySettings, aiSuggestionsEnabled: false })).eq("id", state.userId);
    if (error) throw new Error(error.message);
    set({ settings: { ...state.settings, ...legacySettings, aiSuggestionsEnabled: false } });
  }
  // Only drop the legacy copies once the whole import has succeeded.
  localStorage.removeItem(LEGACY_ENTRIES_KEY);
  localStorage.removeItem(LEGACY_SETTINGS_KEY);
  return imported;
}

/* ---------- appearance ---------- */

export function applyAppearance(settings: Settings) {
  const root = document.documentElement;
  root.dataset.theme = settings.theme;
  root.style.setProperty("--font-display", `"${settings.displayFont}"`);
  root.style.setProperty("--font-body", `"${settings.bodyFont}"`);
}

export const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

/* ---------- passcode hashing ---------- */

/**
 * The lock code is stored as a PBKDF2-SHA256 hash with a per-user random salt,
 * so `profiles.passcode` never holds the digits themselves.
 * Format: `pbkdf2$<iterations>$<saltHex>$<hashHex>`.
 */
const PASSCODE_SCHEME = "pbkdf2";
const PASSCODE_ITERATIONS = 210_000;
const PASSCODE_SALT_BYTES = 16;
const PASSCODE_HASH_BITS = 256;

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

const fromHex = (hex: string) => {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
};

async function derive(code: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(code), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    key,
    PASSCODE_HASH_BITS,
  );
  return toHex(new Uint8Array(bits));
}

/** True when the stored value is a pre-hashing 4-digit code that still needs upgrading. */
export function isLegacyPasscode(stored: string): boolean {
  return /^\d{4}$/.test(stored);
}

/** Hash a code for storage, with a fresh random salt. */
export async function hashPasscode(code: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(PASSCODE_SALT_BYTES));
  const hash = await derive(code, salt, PASSCODE_ITERATIONS);
  return `${PASSCODE_SCHEME}$${PASSCODE_ITERATIONS}$${toHex(salt)}$${hash}`;
}

/** Check a typed code against a stored value, accepting legacy plaintext rows. */
export async function verifyPasscode(code: string, stored: string): Promise<boolean> {
  if (!/^\d{4}$/.test(code) || !stored) return false;
  if (isLegacyPasscode(stored)) return code === stored;
  const [scheme, rawIterations, saltHex, hashHex, extra] = stored.split("$");
  if (scheme !== PASSCODE_SCHEME || !saltHex || !hashHex) return false;
  const iterations = Number(rawIterations);
  if (extra !== undefined || !Number.isInteger(iterations) || iterations <= 0 || iterations > 1_000_000) return false;
  if (!/^[0-9a-f]{32}$/.test(saltHex) || !/^[0-9a-f]{64}$/.test(hashHex)) return false;
  const candidate = await derive(code, fromHex(saltHex), iterations);
  // Constant-time-ish compare; both strings are the same fixed length here.
  if (candidate.length !== hashHex.length) return false;
  let diff = 0;
  for (let i = 0; i < candidate.length; i += 1) diff |= candidate.charCodeAt(i) ^ hashHex.charCodeAt(i);
  return diff === 0;
}
