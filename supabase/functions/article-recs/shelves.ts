/**
 * Which shelves one reader gets, what each is called, what it searches for and
 * what it says about being there. Split out of index.ts because this is the
 * only part that has opinions about people rather than about HTTP.
 *
 * Two kinds of signal arrive. The first-run answers — year level, what is on
 * their plate, what they want from the app, what they are into — always apply.
 * Anything derived from entries only arrives when AI suggestions are on, so
 * every line here has to still read right with that half missing: nothing may
 * claim they wrote something unless `signals` says they did.
 *
 * Nothing identifying is used or accepted. Ids, hobby words, counts.
 */

/** The first-run answers. Ids mirror src/lib/onboarding.ts. */
export type ReaderProfile = {
  yearLevel?: string;
  focus?: string[];
  goals?: string[];
  interests?: string[];
};

/** Counted from entries, never quoted from them. Null when suggestions are off. */
export type EntrySignals = {
  count?: number;
  mood?: number;
  energy?: number;
  feelings?: string[];
  modes?: string[];
  hardestDayPart?: string | null;
};

export type Shelf = {
  /** Heading, in words that fit this reader. */
  label: string;
  /** Which library category backs it when live search is unavailable. */
  library: string;
  /** What the live search asks for. */
  query: string;
  /** Why this shelf is on their page at all. */
  note: string;
  /** Why one article on it is worth their time. */
  why: string;
  /** Extra words the offline library scores its picks against, if any. */
  match?: string;
};

/** Four is a shelf. Eight is a reading list nobody opens. */
const MAX_SHELVES = 4;
/** A second hobby shelf only once they have listed this many interests. */
const INTERESTS_FOR_SECOND_SHELF = 4;

/** Mirrors FOCUS_AREAS in src/lib/onboarding.ts; an unknown id reads as itself. */
const FOCUS_LABELS: Record<string, string> = {
  school: "school and exams",
  friendships: "friendships",
  family: "family",
  sleep: "sleep",
  sport: "sport",
  work: "work",
  health: "health",
  identity: "identity",
};

/** How each year level is described to a search engine. */
const YEAR_SEARCH: Record<string, string> = {
  prep: "students starting high school",
  lower: "junior high school students",
  upper: "high school students",
  senior: "senior high school students",
};

/** How a day-part is said out loud. Same wording as the Patterns page. */
const DAY_PART_WORDS: Record<string, string> = {
  morning: "the mornings",
  afternoon: "the afternoons",
  evening: "the evenings",
  late: "late at night",
};

/** Hobbies that are mostly a body moving. */
const MOVEMENT_WORDS = [
  "sport", "run", "jog", "gym", "lift", "weights", "swim", "surf", "skate", "board", "bike",
  "cycl", "hike", "walk", "climb", "dance", "ballet", "yoga", "pilates", "netball", "football",
  "footy", "soccer", "basketball", "cricket", "tennis", "hockey", "rugby", "volleyball", "athletic",
  "track", "row", "box", "karate", "judo", "martial", "cheer", "golf", "ski", "snowboard", "train",
];

/** Hobbies that are mostly making something. */
const MAKING_WORDS = [
  "music", "guitar", "bass", "drum", "piano", "keyboard", "violin", "sing", "song", "band",
  "produc", "dj", "draw", "sketch", "paint", "art", "design", "anim", "photo", "film", "video",
  "writ", "poetry", "journal", "read", "book", "sew", "knit", "craft", "bake", "cook", "code",
  "program", "build", "model", "game", "gaming",
];

type Ctx = {
  year: string;
  focus: Set<string>;
  goals: Set<string>;
  interests: string[];
  feelings: string[];
  dayPart: string | null;
  mood: number | null;
  energy: number | null;
  /** Lowercased snippets, empty when suggestions are off. */
  text: string;
  /** Whether anything at all came from their entries. */
  wrote: boolean;
};

const yearSearch = (c: Ctx) => YEAR_SEARCH[c.year] ?? "teenagers";

const focusLabel = (id: string) => FOCUS_LABELS[id] ?? id;

/** The first of these feeling tags they actually used, if any. */
const feeling = (c: Ctx, names: string[]) => c.feelings.find((f) => names.includes(f)) ?? null;

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * A trailing `*` marks a deliberate stem: match from a word boundary without
 * requiring one at the end, so "procrastin*" catches procrastinating too.
 * Without it the full word boundary stands, so "down" doesn't hit "download".
 */
const hasKeyword = (text: string, keyword: string) => {
  const stem = keyword.endsWith("*");
  const word = stem ? keyword.slice(0, -1) : keyword;
  const pattern = stem
    ? new RegExp(`\\b${escapeRegExp(word)}`)
    : new RegExp(`\\b${escapeRegExp(word)}\\b`);
  return pattern.test(text);
};

type Theme = {
  id: string;
  library: string;
  keywords: string[];
  /** Focus-area ids that put this shelf on the page. */
  focus: string[];
  /** Feeling tags that point here. */
  feelings: string[];
  /** Goals that make this shelf more likely, not certain. */
  goals: string[];
  label: (c: Ctx) => string;
  query: (c: Ctx) => string;
  /**
   * `evidence` is whether this shelf was actually pointed at by something the
   * reader said or wrote, rather than filled in because the page needed a
   * fourth shelf. A note may only claim a subject came up when it did.
   */
  note: (c: Ctx, evidence: boolean) => string;
  why: (c: Ctx) => string;
};

const THEMES: Theme[] = [
  {
    id: "stress",
    library: "Stress & overwhelm",
    keywords: ["stress", "stressed", "overwhelm", "overwhelmed", "pressure", "too much", "burnout", "panic", "deadline"],
    focus: [],
    feelings: ["overwhelmed", "restless", "frustrated"],
    goals: ["calm"],
    label: (c) => (c.year === "senior" || c.year === "upper" ? "The load right now" : "When it's a lot"),
    query: (c) => `how ${yearSearch(c)} can handle stress and feeling overwhelmed`,
    note: (c, evidence) => {
      if (c.year === "senior" && c.focus.has("school")) {
        return "The last year has a way of stacking up. A few things on carrying it.";
      }
      const named = feeling(c, ["overwhelmed", "restless", "frustrated"]);
      if (named) return `You've been naming ${named} more than most things. A few things about stress.`;
      if (c.wrote && evidence) return "A few things about stress, since it has been coming up in what you write.";
      return "A few things about stress, for the weeks that stack up.";
    },
    why: (c) =>
      c.dayPart
        ? `Worth a look on the days it lands hardest — for you that tends to be ${DAY_PART_WORDS[c.dayPart] ?? c.dayPart}.`
        : "Worth a look on the days everything is stacking up at once.",
  },
  {
    id: "sleep",
    library: "Sleep & energy",
    keywords: ["sleep", "tired", "exhausted", "drained", "insomnia", "awake", "nap", "energy", "late"],
    focus: ["sleep"],
    feelings: ["tired"],
    goals: [],
    label: (c) => (c.dayPart === "late" ? "Late nights" : "Sleep and energy"),
    query: (c) => `${yearSearch(c)} sleep problems and low energy advice`,
    note: (c, evidence) => {
      if (c.focus.has("sleep")) return "You said sleep is one of the things on your plate.";
      if (c.energy !== null && c.energy <= 2) return "Energy has been running low in what you've logged.";
      if (c.wrote && evidence) return "Sleep and energy have shown up more than once lately.";
      return "Sleep, and what it does to the rest of a day.";
    },
    why: () => "Covers the sleep side of feeling flat, without telling you to fix everything tonight.",
  },
  {
    id: "anxiety",
    library: "Anxious thoughts",
    keywords: ["anxious", "anxiety", "worry", "worried", "nervous", "scared", "racing", "spiral", "overthinking"],
    focus: [],
    feelings: ["anxious", "restless"],
    goals: ["calm"],
    label: () => "Thoughts that circle",
    query: (c) => `coping with anxious thoughts and worry ${yearSearch(c)}`,
    note: (c) => {
      const named = feeling(c, ["anxious", "restless"]);
      if (named) return `You've tagged ${named} a fair bit lately. For the thoughts that keep circling back.`;
      if (c.goals.has("calm")) return "You said you came here to calm down. For the thoughts that keep circling back.";
      return "For the thoughts that keep circling back.";
    },
    why: () => "Useful when a worry keeps looping and you cannot put it down.",
  },
  {
    id: "school",
    library: "School & focus",
    keywords: ["school", "class", "homework", "exam", "test", "grades", "study", "focus", "procrastin*", "teacher"],
    focus: ["school"],
    feelings: ["focused"],
    goals: [],
    label: (c) => {
      if (c.year === "prep") return "Starting high school";
      if (c.year === "senior") return "Exams and what rides on them";
      return "School and focus";
    },
    query: (c) => {
      if (c.year === "prep") return "advice for students starting high school settling in";
      if (c.year === "senior") return "senior students exam stress and study pressure";
      return `${yearSearch(c)} focus concentration and schoolwork stress`;
    },
    note: (c, evidence) => {
      if (c.focus.has("school") && c.year === "prep") {
        return "You said school is on your plate, and you're at the start of it.";
      }
      if (c.focus.has("school") && c.year === "senior") {
        return "You said school and exams is what's on your plate this year.";
      }
      if (c.focus.has("school")) return "You said school and exams is part of what you're carrying.";
      if (c.wrote && evidence) return "School has been part of what you are carrying.";
      return "The school side of a week.";
    },
    why: (c) => {
      if (c.year === "senior") return "Pitched at the exam stretch, not at people with all the time in the world.";
      if (c.year === "prep") return "Written for the first year of it, while everything is still new.";
      return "About focus and schoolwork, without any of the hustle talk.";
    },
  },
  {
    id: "people",
    library: "Friends & family",
    keywords: ["friend", "friends", "family", "mom", "mum", "dad", "parents", "sister", "brother", "lonely", "argument", "fight"],
    focus: ["friendships", "family"],
    feelings: ["lonely", "embarrassed"],
    goals: [],
    label: (c) => {
      if (c.focus.has("friendships") && c.focus.has("family")) return "Friends and family";
      if (c.focus.has("family")) return "Home and family";
      if (c.focus.has("friendships")) return "The friend stuff";
      return "Friends and family";
    },
    query: (c) => `${yearSearch(c)} friendships and family relationships advice`,
    note: (c) => {
      if (c.focus.has("friendships") && c.focus.has("family")) return "You named friendships and family both.";
      if (c.focus.has("friendships")) return "Friendships were one of the things you named.";
      if (c.focus.has("family")) return "Family was one of the things you named.";
      if (feeling(c, ["lonely"])) return "Lonely has come up more than once in your tags.";
      return "Some reading on the people around you.";
    },
    why: () => "For the part of this that is about other people.",
  },
  {
    id: "mood",
    library: "Mood & motivation",
    keywords: ["sad", "low", "down", "empty", "numb", "unmotivated", "motivation", "depressed", "hopeless", "bored"],
    focus: [],
    feelings: ["sad", "numb"],
    goals: ["vent"],
    label: () => "Flat stretches",
    query: (c) => `${yearSearch(c)} low mood and motivation what helps`,
    note: (c) => {
      if (c.mood !== null && c.mood <= 2) return "Your entries have been sitting on the heavy side lately.";
      const named = feeling(c, ["sad", "numb"]);
      if (named) return `${named[0].toUpperCase()}${named.slice(1)} has come up more than once in your tags.`;
      return "For the stretches where things feel flat.";
    },
    why: () => "Plain reading for a low stretch, no cheerleading.",
  },
  {
    id: "identity",
    library: "Self & identity",
    keywords: ["myself", "identity", "confidence", "insecure", "ugly", "worth", "compare", "who i am", "fake", "belong"],
    focus: ["identity"],
    feelings: ["embarrassed", "proud"],
    goals: ["patterns"],
    label: () => "How you see yourself",
    query: (c) => `${yearSearch(c)} self esteem and identity`,
    note: (c) => {
      if (c.focus.has("identity")) return "Identity was one of the things you said was on your plate.";
      if (c.goals.has("patterns")) return "You said you're here to notice patterns. This is one place they show up.";
      return "About how you see yourself.";
    },
    why: () => "For the questions about who you are that do not resolve quickly.",
  },
  {
    id: "body",
    library: "Body & movement",
    keywords: ["body", "workout", "exercise", "walk", "run", "eating", "food", "sick", "headache", "sore"],
    focus: ["sport", "health"],
    feelings: [],
    goals: [],
    label: (c) => {
      if (c.focus.has("sport")) return "Sport and the body side";
      if (c.focus.has("health")) return "Health and the body side";
      return "The body side of it";
    },
    query: (c) =>
      c.focus.has("sport")
        ? `${yearSearch(c)} sport training pressure and mental health`
        : `movement exercise and mental health for ${yearSearch(c)}`,
    note: (c) => {
      if (c.focus.has("sport")) return "You said sport is part of your week.";
      if (c.focus.has("health")) return "You said health is one of the things on your plate.";
      if (c.energy !== null && c.energy <= 2) return "Energy has been low, so here is the physical side of that.";
      return "The body side of how a week feels.";
    },
    why: () => "Small, physical things that tend to take the edge off.",
  },
  {
    id: "work",
    library: "Stress & overwhelm",
    keywords: ["work", "job", "shift", "boss", "customer", "wage", "money"],
    focus: ["work"],
    feelings: [],
    goals: [],
    label: () => "Work and the rest of it",
    query: (c) => `${yearSearch(c)} balancing a part time job with school`,
    note: (c, evidence) =>
      c.focus.has("work")
        ? "You said work is part of what you're juggling."
        : evidence
          ? "Work has come up in what you write."
          : "The job side of a week, alongside everything else.",
    why: () => "For fitting a job around everything else.",
  },
];

/** Where the shelf lands when there is nothing at all to go on. */
const DEFAULT_THEMES = ["stress", "sleep", "anxiety", "mood"];

const KEYWORD_WEIGHT = 1;
const FOCUS_WEIGHT = 4;
const FEELING_WEIGHT = 2;
const GOAL_WEIGHT = 1;

function scoreTheme(theme: Theme, c: Ctx): number {
  let score = 0;
  if (c.text) {
    score += theme.keywords.filter((k) => hasKeyword(c.text, k)).length * KEYWORD_WEIGHT;
  }
  score += theme.focus.filter((id) => c.focus.has(id)).length * FOCUS_WEIGHT;
  score += theme.feelings.filter((f) => c.feelings.includes(f)).length * FEELING_WEIGHT;
  score += theme.goals.filter((g) => c.goals.has(g)).length * GOAL_WEIGHT;
  if (c.mood !== null && c.mood <= 2 && (theme.id === "mood" || theme.id === "anxiety")) score += 2;
  if (c.energy !== null && c.energy <= 2 && (theme.id === "sleep" || theme.id === "body")) score += 2;
  if (c.dayPart === "late" && theme.id === "sleep") score += 2;
  return score;
}

const titleCase = (s: string) => (s ? `${s[0].toUpperCase()}${s.slice(1)}` : s);

type InterestKind = "movement" | "making" | "other";

/**
 * Interests are typed by hand and may be misspelled or unrecognisable. This
 * only sorts them coarsely so the wording and the offline picks are not absurd;
 * anything it cannot place is still shown, just described plainly.
 */
function interestKind(interest: string): InterestKind {
  const text = interest.toLowerCase();
  if (MOVEMENT_WORDS.some((w) => text.includes(w))) return "movement";
  if (MAKING_WORDS.some((w) => text.includes(w))) return "making";
  return "other";
}

function interestShelf(interest: string, c: Ctx): Shelf {
  const kind = interestKind(interest);
  const query =
    kind === "movement"
      ? `${interest} and mental health for ${yearSearch(c)}`
      : kind === "making"
        ? `${interest} creativity and mental health for ${yearSearch(c)}`
        : `${interest} as a hobby and mental health for ${yearSearch(c)}`;
  return {
    label: titleCase(interest),
    library: "Things you're into",
    query,
    note: `You put ${interest} down as one of yours. This one starts there rather than with a hard week.`,
    why: `Here because ${interest} is yours — not because something went wrong.`,
    match: interest,
  };
}

/**
 * Rotates which interest gets a shelf, by the day, so someone with a list of
 * them sees a different one over a week rather than the same one forever.
 */
function pickInterests(c: Ctx, now: number): string[] {
  if (!c.interests.length) return [];
  const wanted = c.interests.length >= INTERESTS_FOR_SECOND_SHELF ? 2 : 1;
  const start = Math.floor(now / 86_400_000) % c.interests.length;
  return Array.from({ length: Math.min(wanted, c.interests.length) }, (_, i) =>
    c.interests[(start + i) % c.interests.length],
  );
}

function toCtx(reader: ReaderProfile, signals: EntrySignals | null, concerns: string): Ctx {
  return {
    year: typeof reader.yearLevel === "string" ? reader.yearLevel : "",
    focus: new Set((reader.focus ?? []).filter((id) => typeof id === "string")),
    goals: new Set((reader.goals ?? []).filter((id) => typeof id === "string")),
    interests: (reader.interests ?? []).filter((i) => typeof i === "string" && i.trim()),
    feelings: (signals?.feelings ?? []).map((f) => f.toLowerCase()),
    dayPart: signals?.hardestDayPart ?? null,
    mood: typeof signals?.mood === "number" ? signals.mood : null,
    energy: typeof signals?.energy === "number" ? signals.energy : null,
    text: concerns.toLowerCase(),
    wrote: Boolean(concerns.trim()) || (signals?.count ?? 0) > 0,
  };
}

/**
 * The shelf, in order: what they are carrying first, then what they are into.
 * Everything is capped at MAX_SHELVES so the page stays a page.
 */
export function buildShelves(
  reader: ReaderProfile,
  signals: EntrySignals | null,
  concerns: string,
  now = Date.now(),
): Shelf[] {
  const c = toCtx(reader, signals, concerns);

  const interests = pickInterests(c, now);
  const room = Math.max(MAX_SHELVES - interests.length, 2);

  // `evidence` separates shelves this reader's own signals asked for from the
  // ones filling the page out, so the copy can tell the difference.
  const picked = THEMES.map((theme) => ({ theme, score: scoreTheme(theme, c) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || THEMES.indexOf(a.theme) - THEMES.indexOf(b.theme))
    .map((s) => ({ theme: s.theme, evidence: true }));

  for (const id of DEFAULT_THEMES) {
    if (picked.length >= room) break;
    const theme = THEMES.find((t) => t.id === id);
    if (theme && !picked.some((p) => p.theme === theme)) picked.push({ theme, evidence: false });
  }

  const themed = picked.slice(0, room).map(({ theme, evidence }) => ({
    label: theme.label(c),
    library: theme.library,
    query: theme.query(c),
    note: theme.note(c, evidence),
    why: theme.why(c),
    // The library has a few articles written for one year level; this is what
    // lets them win their shelf for the reader they were written for.
    match: YEAR_SEARCH[c.year] ?? "",
  }));

  return [...themed, ...interests.map((i) => interestShelf(i, c))].slice(0, MAX_SHELVES);
}

/** Words the offline library scores its picks against, when live search is out. */
export function shelfSignalText(
  reader: ReaderProfile,
  signals: EntrySignals | null,
  concerns: string,
): string {
  const focus = (reader.focus ?? []).map(focusLabel);
  const year = reader.yearLevel ? YEAR_SEARCH[reader.yearLevel] ?? "" : "";
  return [
    concerns,
    year,
    focus.join(" "),
    (reader.interests ?? []).join(" "),
    (signals?.feelings ?? []).join(" "),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}
