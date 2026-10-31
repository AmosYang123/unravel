import { recommendSongs } from "@/lib/content";
import type { Entry, Settings, SongSuggestion, SongSuggestions } from "@/lib/types";

export type { SongSuggestion, SongSuggestions };

export async function fetchSongSuggestions(entry: Entry, settings: Settings, seed: number, count = 3): Promise<SongSuggestions> {
  return {
    picks: recommendSongs(entry, settings.musicTastes, settings.musicArtists, count, seed).map((song) => ({
      id: song.id, title: song.title, artist: song.artist, genre: song.genre, reason: song.reason, note: song.note,
    })),
    basis: "from the built-in list",
    source: "offline",
  };
}

export interface ArtistChoice { id: number; name: string; genre: string }
export async function findArtistChoices(_name: string): Promise<ArtistChoice[]> { return []; }
