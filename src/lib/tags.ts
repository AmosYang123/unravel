import { supabase } from "@/integrations/supabase/client";

/**
 * The two boxes where you type something and press Add — artists in Settings,
 * interests in onboarding — run what you typed past the normalize-tag function
 * before it is saved.
 *
 * Three things happen here, in this order:
 *   1. "guitar/piano" and "netball, running" are split into separate chips, so
 *      one press of Add can't leave a chip that reads like a list. Slashes,
 *      commas, semicolons and newlines split; "&" and "and" deliberately do
 *      not, because Simon & Garfunkel is one artist.
 *   2. Artists are checked against Deezer, which is the same catalogue that
 *      later picks their songs, so a misspelled name doesn't quietly produce
 *      generic picks. Interests have no catalogue, so the model only tidies
 *      spelling and capitalisation.
 *   3. The screen is told what happened and how sure it is. A spelling Deezer
 *      confirms is applied with a one-tap way back to the original; a guess is
 *      asked about rather than applied.
 *
 * Nothing here ever blocks or fails: if the network drops, the function errors
 * or the limit is hit, the chip stands exactly as it was typed.
 */

export type TagKind = "artist" | "interest";

/**
 * What became of one term.
 *  - kept:      it went in as typed, and there is nothing to say about it.
 *  - corrected: a better spelling was applied; `suggestion` is the original.
 *  - unsure:    it went in as typed; `suggestion` is what it might have meant.
 *  - unmatched: an artist nothing could find. Kept, but worth mentioning.
 */
export type TagStatus = "kept" | "corrected" | "unsure" | "unmatched";

export interface TagOutcome {
  /** Exactly what they typed, trimmed. Always somewhere to go back to. */
  original: string;
  /** What is on the chip now. */
  value: string;
  status: TagStatus;
  /** The other option: the original for "corrected", the guess for "unsure". */
  suggestion?: string;
}

/** Longer than this is a sentence, not a tag. Mirrors the edge function's cap. */
export const MAX_TAG_LENGTH = 60;
/** One press of Add can't become an unbounded list. Mirrors the edge function. */
export const MAX_TAG_TERMS = 6;

const SEPARATORS = /[/,;\n]+/;

/** The chips one line of typing should become. */
export function splitTagInput(raw: string): string[] {
  const out: string[] = [];
  for (const part of raw.split(SEPARATORS)) {
    const term = part.trim().replace(/\s+/g, " ").slice(0, MAX_TAG_LENGTH);
    if (!term) continue;
    if (out.some((t) => t.toLowerCase() === term.toLowerCase())) continue;
    out.push(term);
    if (out.length >= MAX_TAG_TERMS) break;
  }
  return out;
}

/** Swaps one chip for another, without letting it duplicate one already there. */
export function replaceTag(list: string[], from: string, to: string): string[] {
  const out: string[] = [];
  for (const item of list) {
    const next = item === from ? to : item;
    if (!out.some((x) => x.toLowerCase() === next.toLowerCase())) out.push(next);
  }
  return out;
}

/**
 * Puts the checked versions in place of the ones added optimistically. The
 * count can shrink: "Tyler, The Creator" goes up as two chips and comes back
 * as one.
 */
export function applyTagOutcomes(list: string[], added: string[], outcomes: TagOutcome[]): string[] {
  const dropped = new Set(added.map((t) => t.toLowerCase()));
  const out = list.filter((item) => !dropped.has(item.toLowerCase()));
  for (const outcome of outcomes) {
    if (!out.some((x) => x.toLowerCase() === outcome.value.toLowerCase())) out.push(outcome.value);
  }
  return out;
}

/**
 * Drops the outcomes for terms that never became a chip -- ones already in the
 * list, or past a cap. Anything else is kept, including the single outcome that
 * comes back when two terms turn out to be one artist.
 */
export function keepOutcomesFor(
  terms: string[],
  added: string[],
  outcomes: TagOutcome[],
): TagOutcome[] {
  const skipped = new Set(terms.filter((t) => !added.includes(t)).map((t) => t.toLowerCase()));
  return outcomes.filter((o) => !skipped.has(o.original.toLowerCase()));
}

/** The single line shown under the box. Null when there is nothing worth saying. */
export function tagNotice(outcome: TagOutcome): string | null {
  switch (outcome.status) {
    case "corrected":
      return `Saved as ${outcome.value}.`;
    case "unsure":
      return `Did you mean ${outcome.suggestion}?`;
    case "unmatched":
      return `Couldn't find ${outcome.original}. Kept as you typed it.`;
    default:
      return null;
  }
}

/** The one tap offered beside that line: back to their words, or on to the guess. */
export function tagAction(outcome: TagOutcome): { label: string; value: string } | null {
  if (outcome.status === "corrected") {
    return { label: `Use ${outcome.original} instead`, value: outcome.original };
  }
  if (outcome.status === "unsure" && outcome.suggestion) {
    return { label: "Yes, use that", value: outcome.suggestion };
  }
  return null;
}

/* -- what the edge function sends back ---------------------------------- */

type Source = "match" | "canonical" | "guess" | "none";
type ServerResult = { input: string; value: string; source: Source };

const SOURCES: Source[] = ["match", "canonical", "guess", "none"];

const isServerResult = (value: unknown): value is ServerResult => {
  if (typeof value !== "object" || value === null) return false;
  const { input, value: name, source } = value as Record<string, unknown>;
  return (
    typeof input === "string" &&
    typeof name === "string" &&
    typeof source === "string" &&
    SOURCES.includes(source as Source)
  );
};

const readResults = (data: unknown): ServerResult[] => {
  const results = (data as { results?: unknown } | null)?.results;
  return Array.isArray(results) ? results.filter(isServerResult) : [];
};

/* -- how close two spellings are ---------------------------------------- */
// The same rule the edge function applies to Deezer's results, repeated here
// because that runs on Deno and this runs in the app.

/** Case, accents and punctuation removed, so "Beyoncé!" and "beyonce" compare equal. */
const fold = (value: string): string =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function distance(a: string, b: string): number {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row.push(Math.min((row[j - 1] ?? 0) + 1, (prev[j] ?? 0) + 1, (prev[j - 1] ?? 0) + cost));
    }
    prev = row;
  }
  return prev[b.length] ?? Math.max(a.length, b.length);
}

/** One or two slipped keys in a word that long — not a different word. */
const closeEnough = (a: string, b: string): boolean => {
  const d = distance(a, b);
  return d <= Math.min(3, Math.max(1, Math.floor(Math.min(a.length, b.length) / 6)));
};

const outcomeFor = (kind: TagKind, result: ServerResult): TagOutcome => {
  const original = result.input;
  // "none" first: nothing found is not the same as nothing to change, and an
  // artist nobody can find is worth saying out loud.
  if (result.source === "none") {
    return { original, value: original, status: kind === "artist" ? "unmatched" : "kept" };
  }
  if (result.source === "match" || result.value === original) {
    return { original, value: original, status: "kept" };
  }
  // Deezer's own spelling, or a guess so close it is plainly the same word:
  // apply it and say plainly what it became. Anything further is asked, not
  // assumed.
  if (result.source === "canonical" || closeEnough(fold(original), fold(result.value))) {
    return { original, value: result.value, status: "corrected", suggestion: original };
  }
  return { original, value: original, status: "unsure", suggestion: result.value };
};

/**
 * Checks one line of typing. Returns one outcome per chip, in the order they
 * should appear. Never throws, and never returns nothing when something was
 * typed — the fallback is always their own words.
 *
 * `allowModel` is the aiSuggestionsEnabled setting. With it off, an interest
 * is not sent anywhere at all; an artist is still looked up, because that is a
 * catalogue lookup of one name and not a reading of anything they wrote.
 */
export async function resolveTags(
  kind: TagKind,
  raw: string,
  allowModel: boolean,
): Promise<TagOutcome[]> {
  const terms = splitTagInput(raw);
  if (!terms.length) return [];
  const kept: TagOutcome[] = terms.map((term) => ({ original: term, value: term, status: "kept" }));
  if (kind === "interest" && !allowModel) return kept;

  try {
    // The unsplit line, so a name with a comma in it gets the first look.
    const whole = raw.trim().replace(/\s+/g, " ").slice(0, MAX_TAG_LENGTH);
    const { data, error } = await supabase.functions.invoke("normalize-tag", {
      body: {
        kind,
        terms,
        allowModel,
        ...(kind === "artist" && whole && !terms.includes(whole) ? { whole } : {}),
      },
    });
    if (error) throw error;
    if ((data as { error?: unknown } | null)?.error) throw new Error("normalize-tag declined");

    const results = readResults(data);
    return results.length ? results.map((result) => outcomeFor(kind, result)) : kept;
  } catch {
    // Never blocks: a check that doesn't happen just means the words stand.
    return kept;
  }
}
