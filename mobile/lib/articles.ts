import { supabase } from "@/integrations/supabase/client";
import { entryText } from "@/lib/content";
import type { Entry, Settings, YearLevel } from "@/lib/types";

export interface ArticleRec {
  id: string;
  category: string;
  note: string | null;
  title: string;
  url: string;
  source: string | null;
  summary: string | null;
  why: string | null;
  minutes: number | null;
  created_at: string;
}

/**
 * What the shelf is allowed to know about the reader before a single entry is
 * involved: the first-run answers, as stored ids plus their own hobby words.
 * Never the name, never the email — nothing here identifies anyone.
 */
export interface ReaderProfile {
  yearLevel: YearLevel | "";
  /** FOCUS_AREAS ids. */
  focus: string[];
  /** GOALS ids. */
  goals: string[];
  /** Their own words, tidied only for length and stray characters. */
  interests: string[];
}

/**
 * The part that is derived from what they wrote. Kept separate from the profile
 * because this is the half that `aiSuggestionsEnabled` gates: when suggestions
 * are off it is null and no excerpt, feeling or rating leaves the device.
 */
export interface EntrySignals {
  count: number;
  /** 1..5 averages, rounded. */
  mood: number;
  energy: number;
  /** Feeling tags they used most, most-used first. */
  feelings: string[];
  /** Formats they reach for most, most-used first. */
  modes: string[];
  /** Day-part their entries read lowest in, when there is enough to say so. */
  hardestDayPart: DayPart | null;
}

export interface ArticleRequest {
  refresh: boolean;
  reader: ReaderProfile;
  /** Null when AI suggestions are off. */
  signals: EntrySignals | null;
  /** Short, non-verbatim snippets. Empty when AI suggestions are off. */
  concerns: string;
  /** Mirrors the setting, so the function can refuse entry data server-side too. */
  suggestions: boolean;
}

export type DayPart = "morning" | "afternoon" | "evening" | "late";

/** How many interests travel. More than a few and the shelf stops being a shelf. */
const MAX_SENT_INTERESTS = 6;
/** Longest a single interest can be. Free text, so this is a guard, not a rule. */
const MAX_INTEREST_LENGTH = 40;
/** Entries considered "the last stretch". */
const RECENT_ENTRIES = 12;
/** A day-part needs this many entries before it can be called the hard one. */
const MIN_PER_DAY_PART = 3;
/** Below this gap two mood averages are the same number wearing a hat. */
const MIN_MOOD_SPREAD = 0.5;

const dayPartOf = (iso: string): DayPart => {
  const hour = new Date(iso).getHours();
  if (hour >= 5 && hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  if (hour < 22) return "evening";
  return "late";
};

const average = (nums: number[]) => nums.reduce((a, b) => a + b, 0) / nums.length;

/** Most frequent first, ties broken by first appearance. */
function byFrequency<T>(values: T[]): T[] {
  const counts = new Map<T, number>();
  values.forEach((v) => counts.set(v, (counts.get(v) ?? 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v);
}

/** Control characters would survive JSON and land in a query string. */
const withoutControls = (s: string) =>
  [...s].map((ch) => (ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127 ? " " : ch)).join("");

/**
 * Interests are typed by hand, so they arrive however they arrive — stray
 * punctuation, double spaces, the same hobby twice in different case. Nothing
 * here corrects spelling or guesses at meaning; it only makes the text safe to
 * put in a search query and short enough to read as a heading.
 */
export function tidyInterests(interests: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of interests) {
    if (typeof raw !== "string") continue;
    let cleaned = withoutControls(raw)
      .replace(/["'`<>{}\\]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, MAX_INTEREST_LENGTH)
      // Trailing punctuation is enthusiasm, not part of the hobby.
      .replace(/[!?.,;:\s]+$/, "")
      .replace(/^[!?.,;:\s]+/, "");
    // Shouted in caps reads badly as a heading; the word itself is unchanged.
    if (cleaned.length > 3 && cleaned === cleaned.toUpperCase()) cleaned = cleaned.toLowerCase();
    if (!cleaned) continue;
    // The same hobby typed twice, once with punctuation, is still once.
    const key = cleaned.toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
    if (out.length >= MAX_SENT_INTERESTS) break;
  }
  return out;
}

/** The first-run answers, cleaned up and stripped of anything identifying. */
export function readerProfile(settings: Settings): ReaderProfile {
  return {
    yearLevel: settings.yearLevel,
    focus: settings.focusAreas.slice(0, 8),
    goals: settings.goals.slice(0, 4),
    interests: tidyInterests(settings.interests),
  };
}

/**
 * The day-part their entries read lowest in — only when it is well enough
 * sampled and actually below the rest, on the same reasoning as Patterns:
 * a number that a bigger sample would overturn is worth less than silence.
 */
export function hardestDayPart(entries: Entry[]): DayPart | null {
  const byPart = new Map<DayPart, number[]>();
  entries.forEach((e) => {
    const part = dayPartOf(e.createdAt);
    byPart.set(part, [...(byPart.get(part) ?? []), e.mood]);
  });
  const readings = [...byPart.entries()]
    .filter(([, moods]) => moods.length >= MIN_PER_DAY_PART)
    .map(([part, moods]) => ({ part, mood: average(moods) }))
    .sort((a, b) => a.mood - b.mood);
  const low = readings[0];
  const high = readings[readings.length - 1];
  if (!low || !high || low === high) return null;
  return high.mood - low.mood >= MIN_MOOD_SPREAD ? low.part : null;
}

/** Ratings, tags and formats — counted, never quoted. */
export function entrySignals(entries: Entry[]): EntrySignals | null {
  const recent = entries.slice(0, RECENT_ENTRIES);
  if (!recent.length) return null;
  return {
    count: recent.length,
    mood: Math.round(average(recent.map((e) => e.mood))),
    energy: Math.round(average(recent.map((e) => e.energy))),
    feelings: byFrequency(recent.flatMap((e) => e.feelings)).slice(0, 6),
    modes: byFrequency(recent.map((e) => e.mode)).slice(0, 2),
    hardestDayPart: hardestDayPart(recent),
  };
}

/**
 * Short snippets of the last few entries, and nothing else: the counts and
 * ratings that used to be described in prose here travel as `signals` now, so
 * the words that come back are the person's own rather than our summary of
 * them. Whatever is read from this is what the reader actually wrote.
 */
export function recentConcerns(entries: Entry[]): string {
  return entries
    .slice(0, RECENT_ENTRIES)
    .map((e) => (e.transcriptSummary || entryText(e) || "").trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .slice(0, 5)
    .map((t) => `- ${t.slice(0, 280)}`)
    .join("\n");
}

/**
 * Everything the shelf is built from, assembled in one place so the gate is
 * impossible to miss: with `aiSuggestionsEnabled` off, the entries are not read
 * at all and only the first-run answers travel. The shelf still comes back —
 * it is just built from what they told us rather than what they wrote.
 */
export function articleRequest(entries: Entry[], settings: Settings, refresh: boolean): ArticleRequest {
  const suggestions = settings.aiSuggestionsEnabled;
  return {
    refresh,
    reader: readerProfile(settings),
    signals: suggestions ? entrySignals(entries) : null,
    concerns: suggestions ? recentConcerns(entries) : "",
    suggestions,
  };
}

export async function fetchArticleRecs(
  entries: Entry[],
  settings: Settings,
  refresh = false,
): Promise<{
  items: ArticleRec[];
  generatedAt: string | null;
  stale?: boolean;
  curated?: boolean;
  unchanged?: boolean;
}> {
  const { data, error } = await supabase.functions.invoke("article-recs", {
    body: articleRequest(entries, settings, refresh),
  });

  if (error) {
    const err = error as { message: string; context?: Response };
    let message = err.message;
    if (err.context && typeof err.context.text === "function") {
      try {
        const parsed = JSON.parse(await err.context.text());
        if (parsed?.error) message = parsed.error;
      } catch {
        /* keep original */
      }
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);

  return {
    items: (data?.items ?? []) as ArticleRec[],
    generatedAt: (data?.generatedAt ?? null) as string | null,
    stale: Boolean(data?.stale),
    curated: Boolean(data?.curated),
    unchanged: Boolean(data?.unchanged),
  };
}
