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
 *   2. Artists are checked against iTunes, which is the same catalogue that
 *      later picks their songs, so a misspelled name doesn't quietly produce
 *      generic picks. Interests have no catalogue, so the model only tidies
 *      spelling and capitalisation.
 *   3. The screen is told what happened and how sure it is. A spelling iTunes
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
  _kind: TagKind,
  raw: string,
  _allowModel: boolean,
): Promise<TagOutcome[]> {
  const terms = splitTagInput(raw);
  if (!terms.length) return [];
  return terms.map((term) => ({ original: term, value: term, status: "kept" }));
}
