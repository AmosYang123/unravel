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
