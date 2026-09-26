import { supabase } from "@/integrations/supabase/client";
import { entryThemeGenres, recommendSongs } from "@/lib/content";
import type { Entry, Settings, SongSuggestion, SongSuggestions } from "@/lib/types";

export type { SongSuggestion, SongSuggestions };

/**
 * Live picks from Deezer, shaped by the saved genres/artists and this entry.
 * Falls back to the built-in catalog if Deezer can't answer.
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

    return { picks: data.picks as SongSuggestion[], basis: data.basis as string, source: "deezer" };
  } catch (err) {
    console.error("spotify-songs failed:", err);
    return offline();
  }
}

export interface ArtistChoice {
  id: number;
  name: string;
  fans: number;
  albums: number;
  picture: string | null;
}

/** Below this many fans a same-name match is an upload or a typo, not a real choice. */
const MIN_CHOICE_FANS = 100;

const fold = (s: string) => s.toLowerCase().replace(/\s*\([^)]*\)\s*/g, " ").replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Artists on Deezer that go by exactly this name, most followed first. More
 * than one means Unravel should ask which they meant. Only called with AI
 * suggestions on: the lookup sends the name to Deezer.
 */
export async function findArtistChoices(name: string): Promise<ArtistChoice[]> {
  try {
    const res = await fetch(`https://api.deezer.com/search/artist?limit=10&q=${encodeURIComponent(name)}`);
    if (!res.ok) return [];
    const body = (await res.json()) as { data?: unknown };
    const wanted = fold(name);
    return (Array.isArray(body.data) ? body.data : [])
      .map((a: { id?: unknown; name?: unknown; nb_fan?: unknown; nb_album?: unknown; picture_medium?: unknown }) => ({
        id: Number(a.id),
        name: typeof a.name === "string" ? a.name : "",
        fans: Number(a.nb_fan) || 0,
        albums: Number(a.nb_album) || 0,
        picture: typeof a.picture_medium === "string" && a.picture_medium.startsWith("https://") ? a.picture_medium : null,
      }))
      .filter((a) => Number.isInteger(a.id) && a.id > 0 && fold(a.name) === wanted && a.fans >= MIN_CHOICE_FANS)
      .sort((a, b) => b.fans - a.fans);
  } catch {
    return [];
  }
}
