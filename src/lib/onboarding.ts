import type { Settings, YearLevel } from "./types";

/**
 * The first-run questions, in one place so the onboarding screen and Settings
 * offer exactly the same answers and store exactly the same ids. Labels can be
 * reworded freely; ids are what sits in the database and must not change.
 */
export interface Choice<T extends string = string> {
  id: T;
  label: string;
}

export const YEAR_LEVELS: Choice<YearLevel>[] = [
  { id: "prep", label: "Prep" },
  { id: "lower", label: "Lower" },
  { id: "upper", label: "Upper" },
  { id: "senior", label: "Senior" },
];

export const FOCUS_AREAS: Choice[] = [
  { id: "school", label: "school & exams" },
  { id: "friendships", label: "friendships" },
  { id: "family", label: "family" },
  { id: "sleep", label: "sleep" },
  { id: "sport", label: "sport" },
  { id: "work", label: "work" },
  { id: "health", label: "health" },
  { id: "identity", label: "identity" },
];

export const GOALS: Choice[] = [
  { id: "vent", label: "get things off my chest" },
  { id: "patterns", label: "notice patterns" },
  { id: "calm", label: "calm down" },
  { id: "record", label: "keep a record" },
];

/** How many free-entry interests are kept, so one long session can't grow unbounded. */
export const MAX_INTERESTS = 12;

/** An unknown id reads back as itself rather than disappearing. */
export const labelFor = (choices: Choice[], id: string): string =>
  choices.find((c) => c.id === id)?.label ?? id;

export const isYearLevel = (value: unknown): value is YearLevel =>
  typeof value === "string" && YEAR_LEVELS.some((y) => y.id === value);

/**
 * A short note about who is writing, prefixed to the entry summary the advice
 * function is sent, so a Prep student and a Senior are not answered the same
 * way. Returns null when neither question was answered, in which case the
 * summary goes out exactly as it did before onboarding existed.
 */
export function writerContext(settings: Pick<Settings, "yearLevel" | "focusAreas">): string | null {
  const lines: string[] = [];
  if (settings.yearLevel) {
    lines.push(
      `Who is writing: a ${labelFor(YEAR_LEVELS, settings.yearLevel)} high school student. Pitch the wording and the steps for that age.`,
    );
  }
  const focus = settings.focusAreas.map((id) => labelFor(FOCUS_AREAS, id));
  if (focus.length) {
    lines.push(
      `What has been on their plate lately: ${focus.join(", ")}. Only bring these up if this entry does.`,
    );
  }
  return lines.length ? lines.join("\n") : null;
}
