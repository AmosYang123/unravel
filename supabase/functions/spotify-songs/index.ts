import { hasSharingConsent } from "../_shared/sharing-consent.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";

/**
 * Live song recommendations from the Deezer public API.
 *
 * Third rewrite, and the first one that isn't Spotify. Spotify's Feb 2026
 * rules require the app to be owned by a Premium account before any of the
 * catalog endpoints answer, which this project does not have, so every
 * request was falling through to the 36-song offline catalogue in
 * src/lib/content.ts. An artist a real user actually listed was almost never
 * in that list, so picks degraded to generic mood scoring and felt random.
 *
 * Deezer's public API needs no auth, no app registration, and no token flow,
 * and still returns working 30s preview URLs (which Spotify largely stopped
 * doing). Picks come from GET /search:
 *   - search?q=artist:"<name>" per artist the user listed  (the main source)
 *   - search?q=<genre / bucket term> to fill remaining slots
 * Deezer's search has no real genre facet -- genre: behaves as free text --
 * and track results carry no genre or release date, so `genre` is the label
 * that drove the query and `releasedAt` is omitted rather than guessed.
 * Mood/energy shaping is done here, from the entry, as it always was.
 *
 * The function name and its request/response contract are unchanged;
 * src/lib/music.ts still calls it as `spotify-songs` and reads
 * `source: "deezer"`.
 */

// Slug is historical: this function talks to Deezer, not Spotify. Renaming
// it means redeploying under a new slug and updating the invoke call, which
// isn't worth it for a name.

type Pick = {
  id: string;
  title: string;
  artist: string;
  genre: string;
  reason: string;
  url: string;
  previewUrl: string | null;
  albumArt: string | null;
  releasedAt?: string | null;
};

type DeezerTrack = {
  id: number;
  title?: string;
  link?: string;
  duration?: number;
  rank?: number;
  preview?: string | null;
  artist?: { name?: string };
  album?: { title?: string; cover_medium?: string | null; cover_big?: string | null };
};

type DeezerResponse = {
  data?: unknown[];
  error?: { code?: number; message?: string; type?: string };
};

const MOOD_LABELS = ["heavy", "low", "even", "light", "bright"];

// Genre buckets used to shape picks against mood + energy.
const CALM = ["ambient", "classical", "lo-fi", "bedroom pop", "jazz"];
const LIFT = ["hyperpop", "rap", "pop", "afrobeats", "rock"];

// Deezer is unauthenticated and rate limited around 50 requests / 5s across
// all callers of this IP, so each invocation stays well under that.
const MAX_REQUESTS = 12;
const REQUEST_TIMEOUT_MS = 4000;
const CONCURRENCY = 4;

const RATE_LIMITED = "Deezer is rate limiting right now — try again shortly.";
const UPSTREAM_FAILED = "Deezer didn't return anything for those preferences.";

class Budget {
  private used = 0;
  take(): boolean {
    if (this.used >= MAX_REQUESTS) return false;
    this.used += 1;
    return true;
  }
}

async function deezerGet(budget: Budget, path: string): Promise<DeezerTrack[]> {
  if (!budget.take()) return [];

  let res: Response;
  try {
    res = await fetch(`https://api.deezer.com${path}`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    console.error("Deezer request failed:", err);
    return [];
  }

  if (res.status === 429) {
    throw Object.assign(new Error(RATE_LIMITED), { status: 429 });
  }
  if (!res.ok) {
    console.error(`Deezer request failed [${res.status}]`);
    return [];
  }

  const body = (await res.json().catch(() => null)) as DeezerResponse | null;
  // Deezer reports quota exhaustion as a 200 with an error envelope.
  if (body?.error?.code === 4 || body?.error?.type === "Quota") {
    throw Object.assign(new Error(RATE_LIMITED), { status: 429 });
  }
  if (body?.error) {
    console.error("Deezer returned an error");
    return [];
  }
  return Array.isArray(body?.data) ? (body!.data! as DeezerTrack[]) : [];
}

const deezerSearch = (budget: Budget, query: string, limit: number) =>
  deezerGet(budget, `/search?limit=${limit}&q=${encodeURIComponent(query)}`);

// Deezer's search has no genre facet -- `genre:"lo-fi"` is treated as free
// text and returns whatever is popular, which is how picks ended up feeling
// random. Editor/user playlists named after the genre are the closest thing
// the public API has to a genre feed, so resolve one and read its tracks.
async function tracksForGenre(
  budget: Budget,
  genre: string,
  pickNth: number,
  limit: number,
): Promise<DeezerTrack[]> {
  const lists = (await deezerGet(
    budget,
    `/search/playlist?limit=3&q=${encodeURIComponent(genre)}`,
  )) as unknown as { id?: number; nb_tracks?: number }[];
  const usable = lists.filter((l) => l?.id && (l.nb_tracks ?? 0) >= limit);
  const chosen = usable.length ? usable[pickNth % usable.length] : null;
  if (chosen) {
    const tracks = await deezerGet(budget, `/playlist/${chosen.id}/tracks?limit=${limit}`);
    if (tracks.length) return tracks;
  }
  // No playlist matched: fall back to plain track search on the genre name.
  return deezerSearch(budget, genre, limit);
}

// Run a handful of searches at once instead of serially, but never more than
// CONCURRENCY in flight so the unauthenticated rate limit stays comfortable.
async function mapLimit<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    out.push(...(await Promise.all(items.slice(i, i + CONCURRENCY).map(fn))));
  }
  return out;
}

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

const GENERIC_ERROR = "Something went wrong. Try again in a moment.";

const stringList = z.array(z.unknown()).optional();

const bodySchema = z.object({
  mood: z.unknown().optional(),
  energy: z.unknown().optional(),
  seed: z.unknown().optional(),
  count: z.unknown().optional(),
  artists: stringList,
  genres: stringList,
  themeGenres: stringList,
  feelings: stringList,
});

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

    const parsedBody = bodySchema.safeParse(await req.json().catch(() => null));
    const body: z.infer<typeof bodySchema> = parsedBody.success ? parsedBody.data : {};
    const mood = Math.min(5, Math.max(1, Number(body.mood) || 3));
    const energy = Math.min(5, Math.max(1, Number(body.energy) || 3));
    const seed = typeof body.seed === "number" && Number.isFinite(body.seed) ? Math.abs(body.seed) : 0;
    const count = Math.min(6, Math.max(1, Number(body.count) || 3));
    const toList = (v: unknown, max: number) =>
      Array.isArray(v)
        ? v
            .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
            .map((x) => x.trim().slice(0, 60))
            .slice(0, max)
        : [];
    const artists = toList(body.artists, 8);
    const genres = toList(body.genres, 8);
    const themeGenres = toList(body.themeGenres, 4);
    const feelings = toList(body.feelings, 6);

    const budget = new Budget();

    // Rotate which preferences lead, so repeat entries on the same day differ.
    const rotate = <T,>(list: T[], by: number) =>
      list.length ? list.map((_, i) => list[(i + by) % list.length]) : list;

    // Which bucket the entry sits in. Drives both scoring and, when the user
    // listed no genres of their own, the fallback queries.
    const calmLeaning = energy <= 2 || mood <= 2;
    const liftLeaning = energy >= 4 && mood >= 3;
    const bucket = calmLeaning ? CALM : liftLeaning ? LIFT : [...CALM.slice(0, 2), ...LIFT.slice(2, 4)];
    const bucketLabel = calmLeaning ? "quieter" : liftLeaning ? "higher-energy" : "steady";

    const candidates: (Pick & { score: number; src: "artist" | "genre" })[] = [];
    const seen = new Set<string>();

    const push = (
      track: DeezerTrack,
      genre: string,
      reason: string,
      bonus: number,
      src: "artist" | "genre" = "artist",
    ) => {
      const id = track?.id ? String(track.id) : "";
      if (!id || !track.title || seen.has(id)) return;
      seen.add(id);
      const bucketFit =
        calmLeaning && CALM.includes(genre) ? 3 : liftLeaning && LIFT.includes(genre) ? 3 : 1;
      // Deezer's `rank` is a popularity score in the low millions at the top
      // end; scale it to roughly 0-1 so it only breaks ties.
      const popularity = Math.min(1, Math.max(0, (track.rank ?? 0) / 1_000_000));
      candidates.push({
        id,
        title: track.title,
        artist: track.artist?.name ?? "Unknown",
        genre,
        reason,
        url: track.link ?? `https://www.deezer.com/track/${id}`,
        previewUrl: track.preview && track.preview.length > 0 ? track.preview : null,
        albumArt: track.album?.cover_medium ?? track.album?.cover_big ?? null,
        // Deezer's track search carries no release date. Left off entirely
        // rather than defaulted, so nothing downstream renders a fake one.
        src,
        score: bonus + bucketFit + popularity,
      });
    };

    // 1) Artists the user listed. This is the point of the whole function: if
    // they named someone, that someone should actually show up.
    const leadArtists = rotate(artists, seed).slice(0, 4);
    const artistResults = await mapLimit(leadArtists, async (name) => ({
      name,
      tracks: await deezerSearch(budget, `artist:"${name}"`, 10),
    }));

    for (const { name, tracks } of artistResults) {
      const wanted = name.toLowerCase();
      // Deezer falls back to fuzzy matching, so keep only the artist asked for.
      const exact = tracks.filter((t) => (t.artist?.name ?? "").toLowerCase() === wanted);
      const usable = exact.length ? exact : tracks;
      const label = usable[0]?.artist?.name ?? name;
      // Nothing in a track search says what genre this is, and the user's
      // liked genre didn't drive this query, so don't claim one.
      for (const track of usable) {
        push(track, "your taste", `${label} — an artist you listed`, 14);
      }
    }

    // 2) Genres the user picked, the entry's theme, and — only if they gave
    // neither — the bucket their mood and energy point at. These fill the
    // slots the listed artists don't.
    const preferredGenres = [...rotate(genres, seed), ...themeGenres];
    const genrePool = (preferredGenres.length ? preferredGenres : rotate(bucket, seed)).slice(0, 3);
    const genreResults = await mapLimit(genrePool, async (genre) => ({
      genre,
      tracks: await tracksForGenre(budget, genre, seed, 8),
    }));

    for (const { genre, tracks } of genreResults) {
      const fromTheme = themeGenres.includes(genre) && !genres.includes(genre);
      const fromBucket = !preferredGenres.includes(genre);
      const reason = fromBucket
        ? `${genre}, for a ${bucketLabel} ${MOOD_LABELS[mood - 1]} mood`
        : fromTheme
          ? `${genre}, for what this entry is about`
          : `${genre} is your taste`;
      for (const track of tracks) {
        push(track, genre, reason, fromBucket ? 5 : fromTheme ? 4 : 6, "genre");
      }
    }

    if (candidates.length === 0) {
      return json({ error: UPSTREAM_FAILED }, 502);
    }

    // Best matches first, then rotate within each source using the seed so two
    // entries on the same day get different picks.
    const ranked = candidates.sort((a, b) => b.score - a.score);
    const byArtist = ranked.filter((c) => c.src === "artist").slice(0, count * 4);
    // Round-robin the genre candidates so one genre's popular tracks can't
    // take every remaining slot.
    const genreGroups = new Map<string, typeof ranked>();
    for (const c of ranked.filter((c) => c.src === "genre")) {
      const group = genreGroups.get(c.genre) ?? [];
      group.push(c);
      genreGroups.set(c.genre, group);
    }
    const groups = [...genreGroups.values()];
    const byGenre: typeof ranked = [];
    for (let i = 0; byGenre.length < count * 4 && groups.some((g) => g.length > i); i++) {
      for (const group of groups) {
        if (group[i]) byGenre.push(group[i]);
      }
    }

    const picks: Pick[] = [];
    const names = (artist: string) => artist.split(",").map((n) => n.trim().toLowerCase());
    const take = (item: (typeof ranked)[number] | undefined, dedupeArtists = true) => {
      if (!item) return false;
      if (picks.some((p) => p.id === item.id)) return false;
      if (dedupeArtists) {
        const taken = new Set(picks.flatMap((p) => names(p.artist)));
        if (names(item.artist).some((n) => taken.has(n))) return false;
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars -- stripped from the response payload, only `pick` is kept
      const { score: _score, src: _src, ...pick } = item;
      picks.push(pick);
      return true;
    };
    const drawFrom = (source: typeof ranked, wanted: number) => {
      if (!source.length) return;
      let added = 0;
      for (let i = 0; i < source.length && added < wanted && picks.length < count; i++) {
        if (take(source[(seed + i) % source.length])) added += 1;
      }
    };

    // Saved artists always get at least one slot; saved genres keep the rest so
    // neither preference crowds the other out.
    const artistSlots = artists.length ? (byGenre.length ? Math.max(1, count - 1) : count) : 0;
    drawFrom(byArtist, artistSlots);
    drawFrom(byGenre, count - picks.length);
    drawFrom(byArtist, count - picks.length);
    for (let i = 0; i < ranked.length && picks.length < count; i++) {
      take(ranked[(seed + i) % ranked.length], false);
    }

    const basis = [
      artists.length ? "your artists" : null,
      genres.length ? "your genres" : null,
      `${MOOD_LABELS[mood - 1]} mood`,
      feelings.length ? `"${feelings[0]}"` : null,
    ]
      .filter(Boolean)
      .join(" · ");

    return json({ picks, basis, source: "deezer" });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    console.error("spotify-songs error:", err);
    // These two cases have curated, user-facing messages; everything else
    // stays generic so upstream error text never reaches the client.
    const message =
      err instanceof Error && (status === 429 || status === 502) ? err.message : GENERIC_ERROR;
    return json({ error: message, status }, status);
  }
});
