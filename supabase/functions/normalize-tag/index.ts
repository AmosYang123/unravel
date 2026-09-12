import { hasSharingConsent } from "../_shared/sharing-consent.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";

/**
 * Tidies the short strings people type into the chip boxes, before they are
 * saved: the artists in Settings, and the interests in onboarding.
 *
 * Order matters, because one of these two has a ground truth and the other
 * doesn't:
 *   - An ARTIST is checked against Deezer first, the same catalogue that later
 *     picks their songs in spotify-songs. If Deezer knows the name, its own
 *     spelling wins and the model is never called — no cost, no latency, no
 *     guessing. Only when Deezer finds nothing does the model suggest what
 *     they probably meant, and that suggestion is then looked up on Deezer
 *     too, so the model cannot invent an artist that does not exist.
 *   - An INTEREST has no catalogue to check against, so the model only fixes
 *     spelling and capitalisation. It is told to keep their word and their
 *     meaning.
 *
 * The caller decides what to do with the answer; nothing here is applied
 * silently. `source` says where the value came from so the app can apply a
 * Deezer correction outright but ask before taking a model's guess.
 *
 * Privacy: the request is a handful of short words and nothing else — no entry
 * text, no name, no ids. None of it is logged.
 */

const MODEL = "openai/gpt-oss-20b";

/** Where the returned value came from. */
type Source = "match" | "canonical" | "guess" | "none";

type Result = { input: string; value: string; source: Source };

const ARTIST_SYSTEM = `You correct misspelled music artist names for a journal app.
Each input is something a person typed that a music catalogue could not find.

Rules:
- Answer with the artist they most likely meant, spelled the way that artist is normally credited.
- If you cannot tell who they meant, answer null. Never invent an artist.
- Never answer with a song, an album, a genre, or a sentence.

Respond with JSON only: {"results": [{"input": string, "value": string or null}]}. One object per input, same inputs back.`;

const INTEREST_SYSTEM = `You tidy short hobby and interest labels typed by high school students.

Rules:
- Fix spelling and capitalisation only. Sentence case, keeping proper nouns capitalised.
- Keep their meaning and their words. Never translate, expand, rename, explain or editorialise.
- "bass gitar" becomes "Bass guitar". "gaming" stays "Gaming". Nothing else changes.
- If it is already fine, return it unchanged.
- Never add an interest, never drop one, never merge two.

Respond with JSON only: {"results": [{"input": string, "value": string}]}. One object per input, same inputs back.`;

// Browser origins allowed to call this function. Pinned so a random page cannot
// drive a signed-in user's session.
const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "http://localhost:5173,http://localhost:8080,http://localhost:8081")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const corsFor = (req: Request) => {
  const origin = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
};

// Counted in Postgres: edge instances are ephemeral, so in-memory counters reset.
// One press of Add is one call, and a first-run session fills twelve interests.
const RATE_LIMIT = 80;
const RATE_WINDOW_SECONDS = 3600;

const GENERIC_ERROR = "Something went wrong. Try again in a moment.";

const MAX_TERMS = 6;
const MAX_LENGTH = 60;
const DEEZER_TIMEOUT_MS = 4000;
// A fuzzy Deezer hit has to be a real artist, not a soundalike upload, before
// it is allowed to overwrite what someone typed.
const FUZZY_MIN_FANS = 1000;

const bodySchema = z.object({
  kind: z.enum(["artist", "interest"]),
  terms: z.array(z.string()).min(1).max(MAX_TERMS),
  // The whole line before it was split on slashes and commas. Artists like
  // "Tyler, The Creator" have a comma in the name, so the unsplit line gets
  // the first look and the split terms are only used if it finds nothing.
  whole: z.string().optional(),
  allowModel: z.boolean().optional(),
});

/** Case, accents and punctuation removed, so "Beyoncé!" and "beyonce" compare equal. */
const fold = (value: string): string =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Levenshtein distance, capped work: both sides are at most 60 characters. */
function distance(a: string, b: string): number {
  if (a === b) return 0;
  let prev: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row: number[] = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = row;
  }
  return prev[b.length];
}

/** One or two slipped keys in a word of that length — not a different word. */
const closeEnough = (a: string, b: string): boolean => {
  const d = distance(a, b);
  return d <= Math.min(3, Math.max(1, Math.floor(Math.min(a.length, b.length) / 6)));
};

type DeezerArtist = { name: string; nb_fan?: number };

const isDeezerArtist = (value: unknown): value is DeezerArtist => {
  if (typeof value !== "object" || value === null) return false;
  const name = (value as { name?: unknown }).name;
  return typeof name === "string" && name.trim().length > 0;
};

/**
 * Deezer's own spelling of an artist, or null if it doesn't know them.
 * Deezer's search always answers with something, so a result is only accepted
 * when the name it returns is the name that was asked for, give or take a
 * typo's worth of letters.
 */
async function deezerArtist(term: string): Promise<string | null> {
  let res: Response;
  try {
    res = await fetch(
      `https://api.deezer.com/search/artist?limit=5&q=${encodeURIComponent(term)}`,
      { signal: AbortSignal.timeout(DEEZER_TIMEOUT_MS) },
    );
  } catch {
    // Deliberately not logged: the query is the user's own words.
    return null;
  }
  if (!res.ok) return null;

  const body = (await res.json().catch(() => null)) as { data?: unknown; error?: unknown } | null;
  if (!body || body.error || !Array.isArray(body.data)) return null;

  const artists = body.data.filter(isDeezerArtist);
  const wanted = fold(term);
  if (!wanted) return null;

  const exact = artists.find((a) => fold(a.name) === wanted);
  if (exact) return exact.name;

  const near = artists.find(
    (a) => (a.nb_fan ?? 0) >= FUZZY_MIN_FANS && closeEnough(fold(a.name), wanted),
  );
  return near?.name ?? null;
}

/** What the model thinks each of these was meant to be. Empty on any failure. */
async function askModel(
  apiKey: string,
  kind: "artist" | "interest",
  terms: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!terms.length) return out;

  let res: Response;
  try {
    res = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: "system", content: kind === "artist" ? ARTIST_SYSTEM : INTEREST_SYSTEM },
            { role: "user", content: JSON.stringify({ inputs: terms }) },
          ],
          response_format: { type: "json_object" },
          temperature: 0,
        }),
      },
    );
  } catch (err) {
    console.error("normalize-tag model call failed:", err instanceof Error ? err.message : "unknown");
    return out;
  }

  if (!res.ok) {
    console.error(`normalize-tag model call rejected [${res.status}]`);
    return out;
  }

  const data = (await res.json().catch(() => null)) as unknown;
  const content = (data as { choices?: { message?: { content?: unknown } }[] } | null)
    ?.choices?.[0]?.message?.content;
  const raw = typeof content === "string" ? content : "";
  if (!raw) return out;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // The reply itself is not logged — it echoes the user's words back.
    console.error("normalize-tag model reply was not JSON");
    return out;
  }

  const results = (parsed as { results?: unknown })?.results;
  if (!Array.isArray(results)) return out;

  for (const item of results) {
    if (typeof item !== "object" || item === null) continue;
    const { input, value } = item as { input?: unknown; value?: unknown };
    if (typeof input !== "string" || typeof value !== "string") continue;
    const trimmed = value.trim().slice(0, MAX_LENGTH);
    if (!trimmed || !terms.includes(input)) continue;
    out.set(input, trimmed);
  }
  return out;
}

Deno.serve(async (req) => {
  const corsHeaders = corsFor(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Not signed in." }, 401);

    // The user's own token: row-level security decides what they can reach.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return json({ error: "Not signed in." }, 401);

    if (!await hasSharingConsent(supabase, auth.user.id)) {
      return json({ error: "Enable AI suggestions in Settings after reviewing the data-sharing notice to use this feature." }, 403);
    }

    const { data: allowed, error: rateError } = await supabase.rpc("consume_rate_limit", {
      p_bucket: "normalize-tag",
      p_limit: RATE_LIMIT,
      p_window_seconds: RATE_WINDOW_SECONDS,
    });
    if (rateError) {
      console.error("normalize-tag rate limit check failed:", rateError.message);
      return json({ error: GENERIC_ERROR }, 503);
    }
    if (!allowed) {
      return json({ error: "Too many requests right now — try again in a moment." }, 429);
    }

    const parsedBody = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsedBody.success) return json({ error: "Nothing to check." }, 400);

    const { kind } = parsedBody.data;
    const terms = parsedBody.data.terms
      .map((t) => t.trim().slice(0, MAX_LENGTH))
      .filter((t) => t.length > 0);
    if (!terms.length) return json({ error: "Nothing to check." }, 400);
    const whole = parsedBody.data.whole?.trim().slice(0, MAX_LENGTH) ?? "";
    const allowModel = parsedBody.data.allowModel !== false;

    const apiKey = Deno.env.get("GROQ_API_KEY");
    const useModel = allowModel && Boolean(apiKey);

    const settle = (input: string, value: string | null, source: Source): Result =>
      value && value !== input
        ? { input, value, source }
        : { input, value: input, source: value ? "match" : "none" };

    if (kind === "interest") {
      // No catalogue to check against, so this is the model's job or nobody's.
      const guesses = useModel ? await askModel(apiKey!, "interest", terms) : new Map<string, string>();
      return json({
        results: terms.map((t) => settle(t, guesses.get(t) ?? null, "guess")),
      });
    }

    // 1) The whole line first, so a name with a comma in it stays one artist.
    if (whole && !terms.includes(whole)) {
      const canonical = await deezerArtist(whole);
      if (canonical) return json({ results: [settle(whole, canonical, "canonical")] });
    }

    // 2) Each term against Deezer. This is the cheap, authoritative pass and it
    //    settles almost everything.
    const looked = await Promise.all(
      terms.map(async (term) => ({ term, canonical: await deezerArtist(term) })),
    );

    const unresolved = looked.filter((l) => !l.canonical).map((l) => l.term);
    // 3) Only what Deezer could not place goes to the model, and whatever it
    //    says is looked up on Deezer in turn.
    const guesses =
      useModel && unresolved.length ? await askModel(apiKey!, "artist", unresolved) : new Map<string, string>();
    const verified = new Map<string, string>();
    await Promise.all(
      [...guesses].map(async ([term, guess]) => {
        const canonical = await deezerArtist(guess);
        if (canonical && fold(canonical) === fold(guess)) verified.set(term, canonical);
      }),
    );

    return json({
      results: looked.map(({ term, canonical }) =>
        canonical ? settle(term, canonical, "canonical") : settle(term, verified.get(term) ?? null, "guess"),
      ),
    });
  } catch (err) {
    console.error("normalize-tag error:", err);
    return json({ error: GENERIC_ERROR }, 500);
  }
});
