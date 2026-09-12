import { hasSharingConsent } from "../_shared/sharing-consent.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { libraryShelf, type ShelfRequest } from "./library.ts";
import { buildShelves, shelfSignalText, type EntrySignals, type ReaderProfile, type Shelf } from "./shelves.ts";


const FRESH_HOURS = 72;

const GOOGLE_CSE_ENDPOINT = "https://www.googleapis.com/customsearch/v1";
// Google CSE's free tier is 100 queries/day with no per-second limit that
// matters here, so shelf searches are fired back to back — just the abort
// timeout is kept.
const GOOGLE_CSE_TIMEOUT_MS = 8000;

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
const RATE_LIMIT = 20;
const RATE_WINDOW_SECONDS = 3600;

const GENERIC_ERROR = "Something went wrong. Try again in a moment.";

/** The first-run answers. Ids only, plus their own hobby words — never a name. */
const readerSchema = z.object({
  yearLevel: z.string().max(20).optional(),
  focus: z.array(z.string().max(40)).max(12).optional(),
  goals: z.array(z.string().max(40)).max(8).optional(),
  interests: z.array(z.string().max(60)).max(12).optional(),
});

/** Counted from entries, so it only arrives when AI suggestions are on. */
const signalsSchema = z.object({
  count: z.number().finite().optional(),
  mood: z.number().finite().optional(),
  energy: z.number().finite().optional(),
  feelings: z.array(z.string().max(40)).max(12).optional(),
  modes: z.array(z.string().max(40)).max(6).optional(),
  hardestDayPart: z.string().max(20).nullable().optional(),
});

const bodySchema = z.object({
  concerns: z.string().optional(),
  refresh: z.boolean().optional(),
  reader: readerSchema.optional(),
  signals: signalsSchema.nullable().optional(),
  /** What the app says the privacy switch is set to. The profile has the last word. */
  suggestions: z.boolean().optional(),
  // Older builds sent these next to `concerns`; kept so a stale app still works.
  mood: z.number().finite().optional(),
  energy: z.number().finite().optional(),
});

type Article = {
  title?: string;
  url?: string;
  source?: string | null;
  summary?: string | null;
  why?: string | null;
  minutes?: number | null;
};

type Section = { category?: string; note?: string | null; articles?: Article[] };

type GoogleCseResult = {
  title?: string;
  link?: string;
  snippet?: string;
  displayLink?: string;
};

/** Longest a shelf heading can be. Headings can carry the reader's own words. */
const MAX_LABEL = 60;

/** Google returns snippets/titles with <b> around the matched words. */
const stripTags = (s: string) => s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();

const toShelfRequests = (shelves: Shelf[]): ShelfRequest[] =>
  shelves.map((s) => ({ label: s.label, library: s.library, note: s.note, why: s.why, match: s.match }));

/**
 * One shelf's live search. Nothing about the query is logged: it can carry what
 * the reader said they are into, and that is theirs.
 */
async function searchShelf(apiKey: string, cx: string, shelf: Shelf): Promise<Section | null> {
  const url = `${GOOGLE_CSE_ENDPOINT}?key=${encodeURIComponent(apiKey)}&cx=${encodeURIComponent(cx)}&q=${encodeURIComponent(shelf.query)}&num=5&safe=active`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GOOGLE_CSE_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error(`article-recs Google CSE search failed [${res.status}]`);
      return null;
    }
    const data = (await res.json()) as { items?: GoogleCseResult[] };
    const results = data?.items ?? [];
    const articles = results
      .filter((r) => typeof r.link === "string" && /^https:\/\//.test(r.link) && r.title)
      .slice(0, 3)
      .map((r) => ({
        title: stripTags(String(r.title)),
        url: r.link as string,
        source: r.displayLink ?? "",
        summary: stripTags(r.snippet ?? ""),
        // `minutes` is deliberately absent: a search result gives no honest
        // read-time signal, and the UI already hides a missing read time.
        why: shelf.why,
      }));
    if (!articles.length) return null;
    return { category: shelf.label, note: shelf.note, articles };
  } catch (err) {
    console.error("article-recs Google CSE search errored:", err);
    return null;
  } finally {
    clearTimeout(timer);
  }
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

    const parsedBody = bodySchema.safeParse(await req.json().catch(() => null));
    const input: z.infer<typeof bodySchema> = parsedBody.success ? parsedBody.data : {};
    const refresh = input.refresh === true;
    const reader: ReaderProfile = input.reader ?? {};

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user;
    if (!user) return json({ error: "Not signed in." }, 401);

    const { data: allowed, error: rateError } = await supabase.rpc("consume_rate_limit", {
      p_bucket: "article-recs",
      p_limit: RATE_LIMIT,
      p_window_seconds: RATE_WINDOW_SECONDS,
    });
    if (rateError) {
      console.error("article-recs rate limit check failed:", rateError.message);
      return json({ error: GENERIC_ERROR }, 503);
    }
    if (!allowed) {
      return json({ error: "Too many requests right now — try again in a moment." }, 429);
    }

    // The privacy switch is enforced here as well as in the app, so no build of
    // the app can send entry material past it. The stored setting has the last
    // word and the app can only be stricter; a read that fails counts as off,
    // because the quiet way to be wrong is the safe one.
    const suggestionsOn = await hasSharingConsent(supabase, user.id) && input.suggestions !== false;

    const concerns = suggestionsOn ? (input.concerns ?? "").slice(0, 4000) : "";
    const signals: EntrySignals | null = suggestionsOn
      ? input.signals ??
        (typeof input.mood === "number" || typeof input.energy === "number"
          ? { mood: input.mood, energy: input.energy }
          : null)
      : null;

    // Serve the cached shelf unless it's stale or a refresh was asked for.
    // The user_id filter is defence in depth on top of whatever RLS is in place.
    const { data: cached } = await supabase
      .from("article_recs")
      .select("id, category, note, title, url, source, summary, why, minutes, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(60);

    const newest = cached?.[0]?.created_at ? new Date(cached[0].created_at).getTime() : 0;
    const fresh = newest && Date.now() - newest < FRESH_HOURS * 60 * 60 * 1000;
    if (cached?.length && fresh && !refresh) {
      return json({ items: cached, generatedAt: cached[0].created_at, cached: true });
    }

    // What this reader's shelf is made of: their first-run answers, plus what
    // their entries point at when they have allowed that. Used for the live
    // search and to keep the library fallback on the same subjects.
    const shelves = buildShelves(reader, signals, concerns);
    const signalText = shelfSignalText(reader, signals, concerns);

    const toRows = (sections: Section[]) => {
      const seen = new Set<string>();
      return sections.flatMap((section) => {
        const label = typeof section.category === "string" ? section.category.trim() : "";
        const category = label ? label.slice(0, MAX_LABEL) : "Reading";
        const note = typeof section.note === "string" ? section.note.slice(0, 240) : null;
        return (section.articles ?? [])
          .filter((a) => a && typeof a.url === "string" && /^https:\/\//.test(a.url) && a.title)
          .filter((a) => !seen.has(a.url!) && (seen.add(a.url!), true))
          .slice(0, 3)
          .map((a) => ({
            user_id: user.id,
            category,
            note,
            title: String(a.title).slice(0, 240),
            url: a.url!.slice(0, 1000),
            source: a.source ? String(a.source).slice(0, 120) : null,
            summary: a.summary ? String(a.summary).slice(0, 500) : null,
            why: a.why ? String(a.why).slice(0, 500) : null,
            minutes: Number.isFinite(Number(a.minutes))
              ? Math.min(90, Math.max(1, Number(a.minutes)))
              : null,
          }));
      });
    };

    // The new shelf is written before the old one is dropped, so a failed insert
    // leaves the person's existing shelf intact.
    const save = async (rows: ReturnType<typeof toRows>, curated: boolean, unchanged = false) => {
      const previousIds = (cached ?? []).map((row) => row.id);
      const { data: inserted, error: insertError } = await supabase
        .from("article_recs")
        .insert(rows)
        .select("id, category, note, title, url, source, summary, why, minutes, created_at");
      if (insertError) {
        console.error("article-recs shelf insert failed:", insertError.message);
        if (cached?.length) {
          return json({ items: cached, generatedAt: cached[0].created_at, cached: true, stale: true });
        }
        return json({ error: GENERIC_ERROR }, 400);
      }
      if (previousIds.length) {
        const { error: deleteError } = await supabase
          .from("article_recs")
          .delete()
          .eq("user_id", user.id)
          .in("id", previousIds);
        // A failed cleanup only leaves stale rows behind; the new shelf is saved.
        if (deleteError) console.error("article-recs old shelf cleanup failed:", deleteError.message);
      }
      return json({
        items: inserted,
        generatedAt: inserted?.[0]?.created_at ?? new Date().toISOString(),
        cached: false,
        curated,
        ...(unchanged ? { unchanged: true } : {}),
      });
    };

    // Live search unavailable or unusable → last shelf, else the verified library.
    // On an explicit refresh there's no point handing back the exact same shelf,
    // so that case always tries the library again with the old picks excluded.
    const fallback = async (reason: string) => {
      console.error(`article-recs falling back: ${reason}`);
      if (cached?.length && !refresh) {
        return json({ items: cached, generatedAt: cached[0].created_at, cached: true, stale: true });
      }
      const excludeUrls = new Set((cached ?? []).map((row) => row.url as string));
      const rows = toRows(libraryShelf(signalText, toShelfRequests(shelves), { excludeUrls }));
      if (!rows.length) {
        if (cached?.length) {
          return json({ items: cached, generatedAt: cached[0].created_at, cached: true, stale: true });
        }
        return json({ error: GENERIC_ERROR }, 400);
      }
      const unchanged = refresh && excludeUrls.size > 0 && rows.every((r) => excludeUrls.has(r.url));
      return save(rows, true, unchanged);
    };

    if (!suggestionsOn) return fallback("Personalized external search is off");

    const googleApiKey = Deno.env.get("GOOGLE_CSE_API_KEY");
    const googleCseId = Deno.env.get("GOOGLE_CSE_ID");
    if (!googleApiKey || !googleCseId) return fallback("GOOGLE_CSE_API_KEY/GOOGLE_CSE_ID is not set");

    const sections: Section[] = [];
    for (const shelf of shelves) {
      const section = await searchShelf(googleApiKey, googleCseId, shelf);
      if (section) sections.push(section);
    }

    const rows = toRows(sections);
    if (rows.length < 4) {
      // Too thin on its own — top up from the hand-checked library.
      const seen = new Set(rows.map((r) => r.url));
      const topUp = toRows(libraryShelf(signalText, toShelfRequests(shelves))).filter(
        (r) => !seen.has(r.url),
      );
      if (!rows.length) return fallback("search returned no usable articles");
      return save([...rows, ...topUp], true);
    }

    return save(rows, false);
  } catch (err) {
    console.error("article-recs error:", err);
    return json({ error: GENERIC_ERROR }, 500);
  }
});
