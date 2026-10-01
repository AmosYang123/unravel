import { supabase } from "@/integrations/supabase/client";
import { entryThemeGenres, recommendSongs } from "@/lib/content";
import type { Entry, Settings, SongSuggestion, SongSuggestions } from "@/lib/types";

export type { SongSuggestion, SongSuggestions };

/**
 * Live picks from iTunes, shaped by the saved genres/artists and this entry.
 * Falls back to the built-in catalog if iTunes can't answer.
 */
export async function fetchSongSuggestions(
  entry: Entry,
  settings: Settings,
  seed: number,
  count = 3,
): Promise<SongSuggestions> {
  const offline = (): SongSuggestions => ({
    picks: recommendSongs(entry, settings.musicTastes, settings.musicArtists, count, seed).map((s) => ({
      id: s.id,
      title: s.title,
      artist: s.artist,
      genre: s.genre,
      reason: s.reason,
      note: s.note,
    })),
    basis: "from the built-in list",
    source: "offline",
  });

  try {
    const { data, error } = await supabase.functions.invoke("spotify-songs", {
      body: {
        mood: entry.mood,
        energy: entry.energy,
        feelings: entry.feelings,
        artists: settings.musicArtists,
        artistIds: settings.musicArtistIds,
        genres: settings.musicTastes,
        themeGenres: entryThemeGenres(entry),
        seed,
        count,
      },
    });

    if (error || data?.error || !Array.isArray(data?.picks) || data.picks.length === 0) {
      console.error("spotify-songs unavailable:", error?.message ?? data?.error);
      return offline();
    }

    return { picks: data.picks as SongSuggestion[], basis: data.basis as string, source: "itunes" };
  } catch (err) {
    console.error("spotify-songs failed:", err);
    return offline();
  }
}

export interface ArtistChoice {
  id: number;
  name: string;
  genre: string;
}

const fold = (s: string) => s.toLowerCase().replace(/\s*\([^)]*\)\s*/g, " ").replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Artists on iTunes that go by exactly this name, best known first (Apple
 * ranks by relevance). More than one means Unravel should ask which they
 * meant. iTunes has no follower counts or artist photos, so genre is what
 * tells them apart, and two same-name artists in one genre count as one
 * choice: the person couldn't tell them apart either. Only called with AI
 * suggestions on: the lookup sends the name to Apple.
 */
export async function findArtistChoices(name: string): Promise<ArtistChoice[]> {
  try {
    const res = await fetch(`https://itunes.apple.com/search?media=music&entity=musicArtist&limit=10&term=${encodeURIComponent(name)}`);
    if (!res.ok) return [];
    const body = (await res.json()) as { results?: unknown };
    const wanted = fold(name);
    const choices: ArtistChoice[] = [];
    for (const a of (Array.isArray(body.results) ? body.results : []) as { artistId?: unknown; artistName?: unknown; primaryGenreName?: unknown }[]) {
      const choice = {
        id: Number(a.artistId),
        name: typeof a.artistName === "string" ? a.artistName : "",
        genre: typeof a.primaryGenreName === "string" ? a.primaryGenreName : "",
      };
      if (!Number.isInteger(choice.id) || choice.id <= 0 || fold(choice.name) !== wanted) continue;
      if (choices.some((c) => c.genre === choice.genre)) continue;
      choices.push(choice);
    }
    return choices;
  } catch {
    return [];
  }
}
