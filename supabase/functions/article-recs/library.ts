// Hand-verified fallback shelf. Used when live search is rate-limited or unavailable,
// so the Reading tab is never empty. Every URL was checked to resolve.
export type LibraryItem = {
  category: string;
  title: string;
  url: string;
  source: string;
  summary: string;
  minutes: number;
  tags: string[];
};

export const LIBRARY: LibraryItem[] = [
  {
    category: "Stress & overwhelm",
    title: "Stress: what it is and how to handle it",
    url: "https://kidshealth.org/en/teens/stress.html",
    source: "Nemours KidsHealth",
    summary: "Plain explanation of what stress does in your body and small ways to bring it down.",
    minutes: 6,
    tags: ["stress", "overwhelmed", "tense", "pressure", "anxious"],
  },
  {
    category: "Stress & overwhelm",
    title: "Healthy ways to handle life's stressors",
    url: "https://www.apa.org/topics/stress/tips",
    source: "American Psychological Association",
    summary: "Research-backed habits that actually lower stress, without any hustle talk.",
    minutes: 8,
    tags: ["stress", "overwhelmed", "burnout", "coping"],
  },
  {
    category: "Stress & overwhelm",
    title: "Breathing exercises for stress",
    url: "https://www.nhs.uk/mental-health/self-help/guides-tools-and-activities/breathing-exercises-for-stress/",
    source: "NHS",
    summary: "One short breathing practice you can do sitting anywhere, in a few minutes.",
    minutes: 3,
    tags: ["stress", "panic", "anxious", "calm", "breathing"],
  },
  {
    category: "Stress & overwhelm",
    title: "18 effective stress relief strategies",
    url: "https://www.verywellmind.com/tips-to-reduce-stress-3145195",
    source: "Verywell Mind",
    summary: "A rundown of stress relief habits worth trying, not a single fix-all method.",
    minutes: 7,
    tags: ["stress", "overwhelmed", "pressure", "tense"],
  },
  {
    category: "Stress & overwhelm",
    title: "How to manage anxiety and stress",
    url: "https://au.reachout.com/articles/how-to-deal-with-stress",
    source: "ReachOut",
    summary: "Straightforward advice for bringing stress and anxiety down a notch.",
    minutes: 5,
    tags: ["stress", "overwhelmed", "anxious", "pressure"],
  },
  {
    category: "Sleep & energy",
    title: "Teens and sleep",
    url: "https://www.sleepfoundation.org/teens-and-sleep",
    source: "Sleep Foundation",
    summary: "Why sleep gets harder in high school and what genuinely helps.",
    minutes: 9,
    tags: ["tired", "drained", "sleep", "exhausted", "insomnia"],
  },
  {
    category: "Sleep & energy",
    title: "How to get a better night's sleep",
    url: "https://www.helpguide.org/articles/sleep/getting-better-sleep.htm",
    source: "HelpGuide",
    summary: "Practical changes for falling asleep faster and waking less at night.",
    minutes: 10,
    tags: ["sleep", "tired", "restless", "night"],
  },
  {
    category: "Sleep & energy",
    title: "Sleep tips for teens",
    url: "https://kidshealth.org/en/teens/tips-sleep.html",
    source: "Nemours KidsHealth",
    summary: "A short list of habits that make sleep easier on school nights.",
    minutes: 4,
    tags: ["sleep", "tired", "school"],
  },
  {
    category: "Sleep & energy",
    title: "Sleep problems",
    url: "https://www.nhs.uk/every-mind-matters/mental-health-issues/sleep/",
    source: "NHS",
    summary: "What sleep deprivation and insomnia actually are, and how sleep hygiene helps.",
    minutes: 6,
    tags: ["sleep", "tired", "insomnia", "exhausted"],
  },
  {
    category: "Sleep & energy",
    title: "Sleep and tiredness",
    url: "https://www.nhs.uk/live-well/sleep-and-tiredness/how-to-get-to-sleep/",
    source: "NHS",
    summary: "How to get to sleep, and the everyday habits that quietly wear it down.",
    minutes: 6,
    tags: ["sleep", "tired", "restless", "night"],
  },
  {
    category: "Anxious thoughts",
    title: "Anxiety, explained without alarm",
    url: "https://kidshealth.org/en/teens/anxiety.html",
    source: "Nemours KidsHealth",
    summary: "What anxiety is, how it shows up physically, and when it helps to ask for support.",
    minutes: 7,
    tags: ["anxious", "worried", "nervous", "panic", "scared"],
  },
  {
    category: "Anxious thoughts",
    title: "Every Mind Matters: anxiety",
    url: "https://www.nhs.uk/every-mind-matters/mental-health-issues/anxiety/",
    source: "NHS",
    summary: "Calm, concrete steps for anxious spirals, plus signs it's worth talking to someone.",
    minutes: 6,
    tags: ["anxious", "worried", "overthinking", "spiral"],
  },
  {
    category: "Anxious thoughts",
    title: "Mindfulness, defined",
    url: "https://greatergood.berkeley.edu/topic/mindfulness/definition",
    source: "Greater Good, UC Berkeley",
    summary: "What mindfulness actually is, and what it does and doesn't fix.",
    minutes: 5,
    tags: ["anxious", "overthinking", "restless", "mindfulness"],
  },
  {
    category: "Anxious thoughts",
    title: "What is anxiety?",
    url: "https://au.reachout.com/articles/what-is-anxiety",
    source: "ReachOut",
    summary: "What anxiety is, its symptoms, and what treatment can look like.",
    minutes: 6,
    tags: ["anxious", "worried", "nervous", "panic"],
  },
  {
    category: "Anxious thoughts",
    title: "Anxiety disorders",
    url: "https://kidshealth.org/en/teens/anxiety-disorders.html",
    source: "Nemours KidsHealth",
    summary: "Where ordinary anxiety ends and something worth extra support begins.",
    minutes: 6,
    tags: ["anxious", "worried", "scared", "panic"],
  },
  {
    category: "School & focus",
    title: "Homework and focus without the spiral",
    url: "https://kidshealth.org/en/teens/homework.html",
    source: "Nemours KidsHealth",
    summary: "Ways to start work when starting is the hardest part.",
    minutes: 5,
    tags: ["school", "homework", "focus", "procrastinating", "grades", "busy"],
  },
  {
    category: "School & focus",
    title: "Do I need help? Recognising when to reach out",
    url: "https://www.nimh.nih.gov/health/publications/my-mental-health-do-i-need-help",
    source: "National Institute of Mental Health",
    summary: "A short guide for telling ordinary hard weeks from something worth support.",
    minutes: 5,
    tags: ["overwhelmed", "help", "heavy", "school", "hopeless"],
  },
  {
    category: "School & focus",
    title: "Stress management techniques for students",
    url: "https://www.verywellmind.com/how-to-stop-procrastinating-3145179",
    source: "Verywell Mind",
    summary: "How student stress affects health and grades, and what actually manages it.",
    minutes: 7,
    tags: ["school", "stress", "grades", "study", "exam"],
  },
  {
    category: "School & focus",
    title: "Test anxiety",
    url: "https://kidshealth.org/en/teens/test-anxiety.html",
    source: "Nemours KidsHealth",
    summary: "Why some pre-test nerves turn intense, and what brings them back down.",
    minutes: 5,
    tags: ["school", "test", "exam", "anxious", "grades"],
  },
  {
    category: "School & focus",
    title: "3 tips for starting high school",
    url: "https://au.reachout.com/study-work-and-money/school-and-study/tips-for-starting-high-school",
    source: "ReachOut",
    summary: "Three practical things that ease the move into high school when it is all still new.",
    minutes: 4,
    tags: ["starting high school", "new school", "school", "nervous", "change"],
  },
  {
    category: "School & focus",
    title: "How to handle fear about the future: a guide for year 12 students",
    url: "https://au.reachout.com/study-work-and-money/school-and-study/handling-fear-about-the-future-year-12-student-guide",
    source: "ReachOut",
    summary: "For when what comes after school is the part that keeps you up at night.",
    minutes: 6,
    tags: ["senior", "year 12", "exam", "future", "school", "study"],
  },
  {
    category: "School & focus",
    title: "How to manage your time while studying",
    url: "https://au.reachout.com/study-work-and-money/exam-stress/how-to-manage-your-time-while-studying",
    source: "ReachOut",
    summary: "Ways to handle study time that don't come down to studying harder.",
    minutes: 5,
    tags: ["study", "exam", "school", "focus", "procrastinating", "time"],
  },
  {
    category: "Friends & family",
    title: "When you feel lonely",
    url: "https://kidshealth.org/en/teens/lonely.html",
    source: "Nemours KidsHealth",
    summary: "Loneliness as a signal rather than a flaw, and small ways back toward people.",
    minutes: 5,
    tags: ["lonely", "left out", "alone", "isolated", "friends"],
  },
  {
    category: "Friends & family",
    title: "Getting through a fight with a friend",
    url: "https://kidshealth.org/en/teens/fight.html",
    source: "Nemours KidsHealth",
    summary: "How to say the hard thing, and what to do when an apology doesn't land.",
    minutes: 5,
    tags: ["fight", "argument", "friends", "family", "angry", "hurt"],
  },
  {
    category: "Friends & family",
    title: "Making and keeping good friends",
    url: "https://www.helpguide.org/articles/relationships-communication/making-good-friends.htm",
    source: "HelpGuide",
    summary: "Where real friendships come from when the usual advice feels useless.",
    minutes: 9,
    tags: ["lonely", "friends", "new", "connection"],
  },
  {
    category: "Friends & family",
    title: "Relationships, defined",
    url: "https://greatergood.berkeley.edu/topic/relationships/definition",
    source: "Greater Good, UC Berkeley",
    summary: "What research says makes a relationship actually work, in plain terms.",
    minutes: 5,
    tags: ["friends", "family", "connection", "relationship"],
  },
  {
    category: "Mood & motivation",
    title: "Feeling low, and what depression looks like",
    url: "https://kidshealth.org/en/teens/depression.html",
    source: "Nemours KidsHealth",
    summary: "The difference between a heavy stretch and depression, in plain words.",
    minutes: 7,
    tags: ["low", "heavy", "sad", "numb", "empty", "hopeless", "unmotivated"],
  },
  {
    category: "Mood & motivation",
    title: "What gratitude actually does",
    url: "https://greatergood.berkeley.edu/topic/gratitude/definition",
    source: "Greater Good, UC Berkeley",
    summary: "The evidence behind noticing good things — no forced positivity.",
    minutes: 6,
    tags: ["gratitude", "low", "flat", "mood"],
  },
  {
    category: "Mood & motivation",
    title: "7 facts everyone should know about depression",
    url: "https://www.verywellmind.com/warning-signs-of-depression-1067617",
    source: "Verywell Mind",
    summary: "Depression is real and treatable — what that means in practice.",
    minutes: 6,
    tags: ["low", "sad", "hopeless", "depressed", "empty"],
  },
  {
    category: "Mood & motivation",
    title: "Everything you need to know about depression",
    url: "https://au.reachout.com/articles/what-is-depression",
    source: "ReachOut",
    summary: "Symptoms, causes, and types of depression, plus how to get help.",
    minutes: 7,
    tags: ["low", "sad", "depressed", "hopeless", "numb"],
  },
  {
    category: "Self & identity",
    title: "Self-esteem, honestly",
    url: "https://kidshealth.org/en/teens/self-esteem.html",
    source: "Nemours KidsHealth",
    summary: "Where harsh self-talk comes from and how it loosens over time.",
    minutes: 6,
    tags: ["self", "insecure", "not enough", "comparison", "ashamed", "identity"],
  },
  {
    category: "Self & identity",
    title: "Self-compassion and why it isn't softness",
    url: "https://greatergood.berkeley.edu/topic/compassion/definition",
    source: "Greater Good, UC Berkeley",
    summary: "Treating yourself the way you'd treat a friend, and the research behind it.",
    minutes: 6,
    tags: ["self", "guilt", "harsh", "perfectionism", "ashamed"],
  },
  {
    category: "Self & identity",
    title: "How to be more confident: 9 tips that work",
    url: "https://www.verywellmind.com/how-to-improve-self-esteem-4163098",
    source: "Verywell Mind",
    summary: "Confidence habits linked to lower anxiety and better mental well-being.",
    minutes: 6,
    tags: ["self", "insecure", "confidence", "not enough"],
  },
  {
    category: "Self & identity",
    title: "Self-esteem: influences, traits, and how to improve it",
    url: "https://www.verywellmind.com/what-is-self-esteem-2795868",
    source: "Verywell Mind",
    summary: "What self-esteem is made of, and why it matters for motivation and mood.",
    minutes: 7,
    tags: ["self", "worth", "identity", "comparison"],
  },
  {
    category: "Self & identity",
    title: "10 tips for improving your self-esteem",
    url: "https://au.reachout.com/articles/how-to-improve-your-self-esteem",
    source: "ReachOut",
    summary: "Concrete starting points for self-esteem, without the vague pep talk.",
    minutes: 5,
    tags: ["self", "insecure", "not enough", "worth"],
  },
  {
    category: "Body & movement",
    title: "Moving your body when stress is stuck in it",
    url: "https://www.apa.org/topics/exercise-fitness/stress",
    source: "American Psychological Association",
    summary: "Why even small movement changes how stress feels physically.",
    minutes: 6,
    tags: ["restless", "tense", "stress", "movement", "body"],
  },
  {
    category: "Body & movement",
    title: "Exercise, without the fitness pressure",
    url: "https://kidshealth.org/en/teens/exercise-wise.html",
    source: "Nemours KidsHealth",
    summary: "Gentle ways to move that don't turn into another thing to fail at.",
    minutes: 5,
    tags: ["movement", "body", "energy", "drained"],
  },
  {
    category: "Body & movement",
    title: "Meditation and mindful movement",
    url: "https://www.apa.org/topics/mindfulness/meditation",
    source: "American Psychological Association",
    summary: "What meditation does to a busy nervous system, according to research.",
    minutes: 7,
    tags: ["meditation", "anxious", "calm", "mindfulness"],
  },
  {
    category: "Body & movement",
    title: "Benefits of exercise",
    url: "https://www.nhs.uk/live-well/exercise/exercise-health-benefits/",
    source: "NHS",
    summary: "How regular movement can lift mood, not just fitness.",
    minutes: 5,
    tags: ["movement", "body", "energy", "drained", "mood"],
  },
  {
    category: "Body & movement",
    title: "How do I get motivated to exercise?",
    url: "https://au.reachout.com/mental-wellbeing/exercise-and-eating-well/how-to-exercise-when-youre-not-motivated",
    source: "ReachOut",
    summary: "Why moving helps, and how to build a routine that fits you rather than someone else.",
    minutes: 5,
    tags: ["movement", "exercise", "motivation", "sport", "drained", "energy"],
  },
  {
    // Backs the shelves built from what someone said they're into, so the
    // offline fallback still has somewhere honest to send them. The general
    // one leads: it is what an interest none of the others fit falls back to.
    category: "Things you're into",
    title: "Mental wellbeing tips",
    url: "https://www.nhs.uk/every-mind-matters/mental-wellbeing-tips/",
    source: "NHS",
    summary: "The NHS's own set of everyday tips for looking after your mental wellbeing.",
    minutes: 5,
    tags: ["hobby", "interest", "wellbeing", "routine", "enjoy", "draw", "paint", "manga", "craft", "baking", "cooking", "coding", "writing"],
  },
  {
    category: "Things you're into",
    title: "How to use music for mental health",
    url: "https://au.reachout.com/mental-wellbeing/selfcare/how-to-use-music-for-mental-health",
    source: "ReachOut",
    summary: "How music shifts a mood, and how to reach for it on purpose rather than by accident.",
    minutes: 5,
    tags: ["music", "guitar", "bass", "piano", "drum", "sing", "song", "band", "listening"],
  },
  {
    category: "Things you're into",
    title: "5 ways music can get you through tough times",
    url: "https://au.reachout.com/challenges-and-coping/coping/5-ways-music-can-get-you-through-tough-times",
    source: "ReachOut",
    summary: "What music actually does for mood, motivation, rest and the people around you.",
    minutes: 4,
    tags: ["music", "song", "playlist", "band", "guitar", "produc", "dj"],
  },
  {
    category: "Things you're into",
    title: "How sport wins at wellbeing",
    url: "https://au.reachout.com/mental-wellbeing/exercise-and-eating-well/how-sport-wins-at-wellbeing",
    source: "ReachOut",
    summary: "What comes with playing sport past the fitness part — the people, the routine, the fun of it.",
    minutes: 5,
    tags: ["sport", "netball", "football", "soccer", "basketball", "cricket", "team", "training", "club"],
  },
];

/** One shelf to fill: what it is called, which category backs it, what it says. */
export type ShelfRequest = {
  /** Heading shown to the reader, which is not always a library category name. */
  label: string;
  library: string;
  note: string | null;
  why: string | null;
  /** Words this shelf's own picks are scored against before the shared ones. */
  match?: string;
};

/** How much a tag matching the shelf's own words outweighs a general match. */
const MATCH_WEIGHT = 10;

/**
 * Fill the given shelves from the verified library, for when live search is
 * unavailable. The shelves come from whatever the reader's own signals asked
 * for, so the fallback tracks the person rather than a fixed set of headings.
 *
 * `excludeUrls` — usually the shelf just shown — is skipped first so a refresh
 * surfaces different articles rather than repeating itself. If a shelf doesn't
 * have enough unseen articles it is topped up from the excluded ones, so it
 * never comes back thinner than asked. No article appears twice on one page,
 * and a shelf left with nothing is dropped rather than shown empty.
 */
export function libraryShelf(
  signalText: string,
  shelves: ShelfRequest[],
  opts: { limitPerCategory?: number; excludeUrls?: Set<string> } = {},
) {
  const limitPerCategory = opts.limitPerCategory ?? 3;
  const excludeUrls = opts.excludeUrls ?? new Set<string>();
  const text = signalText.toLowerCase();

  const wanted: ShelfRequest[] = shelves.length
    ? shelves
    : [...new Set(LIBRARY.map((i) => i.category))].slice(0, 4).map((category) => ({
        label: category,
        library: category,
        note: null,
        why: null,
      }));

  const used = new Set<string>();

  return wanted
    .map((shelf) => {
      const own = (shelf.match ?? "").toLowerCase();
      const inCategory = LIBRARY.filter((item) => item.category === shelf.library)
        .map((item) => ({
          item,
          score:
            item.tags.reduce((s, tag) => (own.includes(tag) ? s + MATCH_WEIGHT : s), 0) +
            item.tags.reduce((s, tag) => (text.includes(tag) ? s + 1 : s), 0),
        }))
        .sort((a, b) => b.score - a.score)
        .filter((s) => !used.has(s.item.url));
      const unseen = inCategory.filter((s) => !excludeUrls.has(s.item.url));
      const alreadySeen = inCategory.filter((s) => excludeUrls.has(s.item.url));
      const picked = [...unseen, ...alreadySeen].slice(0, limitPerCategory);
      picked.forEach(({ item }) => used.add(item.url));
      return {
        category: shelf.label,
        note: shelf.note,
        articles: picked.map(({ item }) => ({
          title: item.title,
          url: item.url,
          source: item.source,
          summary: item.summary,
          why: shelf.why,
          minutes: item.minutes,
        })),
      };
    })
    .filter((section) => section.articles.length > 0);
}
