/**
 * The statistics behind the Patterns page. Everything here is derived from
 * `entry_stats()`, a Postgres function scoped by RLS to the calling user and
 * computed only from mood, energy, feelings, mode and timestamps — the page
 * promises that entry text, titles, transcripts and gratitude are never
 * read, and that promise lives or dies in what that function selects.
 *
 * The counting (means, bucketing, sorting) happens in SQL. The judgement —
 * whether a sample is big enough to say anything about, whether two numbers
 * are actually apart — happens here. Every observation is gated on sample
 * size before it is offered at all, and a claim that a bigger sample would
 * not survive is withheld rather than hedged.
 */

const DAY_MS = 86_400_000;
/** Length of both the "lately" window and the "first month" it is set against. */
const WINDOW_DAYS = 30;
/** Neither energy window is shown as a comparison below this many entries. */
const MIN_WINDOW_ENTRIES = 5;
/** A weekday needs this many entries before it can be named. */
const MIN_PER_WEEKDAY = 4;
/** And this many weekdays have to qualify before highest/lowest means anything. */
const MIN_WEEKDAYS = 3;
/** A day-part needs this many entries before it can be named. */
const MIN_PER_DAY_PART = 5;
/** "Most of your entries" has to beat the next day-part by this much to be worth saying. */
const MIN_DOMINANCE_RATIO = 1.5;
/** Below this gap the two averages are the same number wearing a hat. */
const MIN_SPREAD = 0.5;
/** A feeling is only "recurring" once it has come up this often. */
const MIN_FEELING_COUNT = 3;

const DAY_PART_LABELS: Record<string, string> = {
  morning: "the morning",
  afternoon: "the afternoon",
  evening: "the evening",
  late: "the late hours",
};

/** Local YYYY-MM-DD, the shape the Timeline reads from its `on` search param. */
export const dayParam = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export interface EntryStats {
  total: number;
  newestAt: string | null;
  oldestAt: string | null;
  energyWindows: {
    recent: { n: number; avgEnergy: number | null };
    earlier: { n: number; avgEnergy: number | null };
  };
  weekday: { day: number; n: number; avgEnergy: number | null }[];
  dayParts: { id: string; n: number; avgMood: number | null }[];
  feelings: { feeling: string; n: number }[];
  recent: { id: string; createdAt: string; energy: number }[];
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const isNumberOrNull = (v: unknown): v is number | null => v === null || typeof v === "number";
const isStringOrNull = (v: unknown): v is string | null => v === null || typeof v === "string";

const isWindow = (v: unknown): v is { n: number; avgEnergy: number | null } =>
  isRecord(v) && typeof v.n === "number" && isNumberOrNull(v.avgEnergy);

const isWeekdayRow = (v: unknown): v is { day: number; n: number; avgEnergy: number | null } =>
  isRecord(v) && typeof v.day === "number" && typeof v.n === "number" && isNumberOrNull(v.avgEnergy);

const isDayPartRow = (v: unknown): v is { id: string; n: number; avgMood: number | null } =>
  isRecord(v) && typeof v.id === "string" && typeof v.n === "number" && isNumberOrNull(v.avgMood);

const isFeelingRow = (v: unknown): v is { feeling: string; n: number } =>
  isRecord(v) && typeof v.feeling === "string" && typeof v.n === "number";

const isRecentRow = (v: unknown): v is { id: string; createdAt: string; energy: number } =>
  isRecord(v) && typeof v.id === "string" && typeof v.createdAt === "string" && typeof v.energy === "number";

/** Narrows the `entry_stats()` RPC payload — untyped at the boundary — into `EntryStats`. */
export const isEntryStats = (v: unknown): v is EntryStats =>
  isRecord(v) &&
  typeof v.total === "number" &&
  isStringOrNull(v.newestAt) &&
  isStringOrNull(v.oldestAt) &&
  isRecord(v.energyWindows) &&
  isWindow(v.energyWindows.recent) &&
  isWindow(v.energyWindows.earlier) &&
  Array.isArray(v.weekday) &&
  v.weekday.every(isWeekdayRow) &&
  Array.isArray(v.dayParts) &&
  v.dayParts.every(isDayPartRow) &&
  Array.isArray(v.feelings) &&
  v.feelings.every(isFeelingRow) &&
  Array.isArray(v.recent) &&
  v.recent.every(isRecentRow);

export interface EnergyWindow {
  avg: number;
  n: number;
}

/**
 * Recent energy against the user's own start, rather than an all-time mean that
 * gets blunter every month. "Lately" is the 30 days up to their newest entry;
 * "first month" is the 30 days from their oldest. The comparison is withheld
 * unless the two windows are disjoint and both carry enough entries.
 */
export function energyWindows(
  stats: EntryStats,
): { recent: EnergyWindow; earlier: EnergyWindow | null } | null {
  const { total, newestAt, oldestAt, energyWindows: windows } = stats;
  if (!total || newestAt === null || oldestAt === null || windows.recent.avgEnergy === null) return null;

  const recent: EnergyWindow = { avg: windows.recent.avgEnergy, n: windows.recent.n };

  const recentStart = new Date(newestAt).getTime() - WINDOW_DAYS * DAY_MS;
  const earlierEnd = new Date(oldestAt).getTime() + WINDOW_DAYS * DAY_MS;
  const disjoint = earlierEnd < recentStart;
  const enough = recent.n >= MIN_WINDOW_ENTRIES && windows.earlier.n >= MIN_WINDOW_ENTRIES;
  if (!disjoint || !enough || windows.earlier.avgEnergy === null) return { recent, earlier: null };
  return { recent, earlier: { avg: windows.earlier.avgEnergy, n: windows.earlier.n } };
}

export interface WeekdayReading {
  day: number;
  avg: number;
  n: number;
}

/**
 * The lowest and highest weekday by average energy — but only when at least
 * three weekdays clear the sample floor and the two ends are actually apart.
 */
export function weekdayContrast(weekday: EntryStats["weekday"]): { low: WeekdayReading; high: WeekdayReading } | null {
  const qualified = weekday
    .filter((w): w is typeof w & { avgEnergy: number } => w.n >= MIN_PER_WEEKDAY && w.avgEnergy !== null)
    .map((w) => ({ day: w.day, avg: w.avgEnergy, n: w.n }))
    .sort((a, b) => a.avg - b.avg);

  if (qualified.length < MIN_WEEKDAYS) return null;
  const low = qualified[0];
  const high = qualified[qualified.length - 1];
  if (high.avg - low.avg < MIN_SPREAD) return null;
  return { low, high };
}

export interface DayPartReading {
  id: string;
  label: string;
  mood: number;
  n: number;
}

export interface DayPartFocus {
  /** The day-part they write in most, when it actually outruns the next one. */
  dominant: DayPartReading | null;
  /** The brightest and heaviest day-parts, when both are well sampled and apart. */
  high: DayPartReading | null;
  low: DayPartReading | null;
}

/**
 * Two separate observations, gated separately. "Most of your entries land in
 * the evening" is only worth saying when the evening beats the next day-part by
 * half again — someone who only ever writes in the evening is told nothing by
 * being told that, and neither is someone whose top two are neck and neck.
 */
export function dayPartFocus(dayParts: EntryStats["dayParts"]): DayPartFocus | null {
  const readings: DayPartReading[] = dayParts
    .filter((p): p is typeof p & { avgMood: number } => p.n > 0 && p.avgMood !== null)
    .map((p) => ({ id: p.id, label: DAY_PART_LABELS[p.id] ?? p.id, mood: p.avgMood, n: p.n }));

  const [leader, runnerUp] = [...readings].sort((a, b) => b.n - a.n || a.id.localeCompare(b.id));
  const dominant =
    leader && runnerUp && leader.n >= MIN_PER_DAY_PART && leader.n >= runnerUp.n * MIN_DOMINANCE_RATIO
      ? leader
      : null;

  const byMood = readings.filter((r) => r.n >= MIN_PER_DAY_PART).sort((a, b) => a.mood - b.mood);
  const low = byMood[0];
  const high = byMood[byMood.length - 1];
  const apart = Boolean(low && high && low.id !== high.id && high.mood - low.mood >= MIN_SPREAD);

  if (!dominant && !apart) return null;
  return { dominant, high: apart ? high : null, low: apart ? low : null };
}

export interface FeelingCount {
  feeling: string;
  n: number;
}

/** Feelings the user tagged at least MIN_FEELING_COUNT times, most-used first. */
export function recurringFeelings(feelings: EntryStats["feelings"]): FeelingCount[] {
  return feelings.filter((f) => f.n >= MIN_FEELING_COUNT).slice(0, 5);
}
