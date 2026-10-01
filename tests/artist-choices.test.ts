import { afterEach, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { findArtistChoices } from "../mobile/lib/music";

afterEach(() => vi.restoreAllMocks());

const itunes = (artists: unknown[]) =>
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ resultCount: artists.length, results: artists }), { status: 200 }));

const artist = (artistId: number, artistName: string, primaryGenreName?: string) =>
  ({ wrapperType: "artist", artistId, artistName, primaryGenreName });

it("offers every same-name artist, in Apple's relevance order, told apart by genre", async () => {
  const request = itunes([
    artist(154751, "Bush", "Rock"),
    artist(1713811691, "Bush", "Pop"),
    artist(27057714, "Kristian Bush", "Country"),
    artist(487277, "Kate Bush", "Pop"),
  ]);
  const choices = await findArtistChoices("bush");
  expect(String(request.mock.calls[0][0])).toContain("https://itunes.apple.com/search?media=music&entity=musicArtist");
  expect(choices).toEqual([
    { id: 154751, name: "Bush", genre: "Rock" },
    { id: 1713811691, name: "Bush", genre: "Pop" },
  ]);
});

it("treats a name with a country tag as the same name", async () => {
  itunes([artist(1, "Nirvana", "Rock"), artist(2, "Nirvana (UK)", "Psychedelic")]);
  expect((await findArtistChoices("Nirvana")).length).toBe(2);
});

it("asks nothing when the same-name artists share a genre", async () => {
  itunes([artist(1, "Kehlani", "R&B/Soul"), artist(2, "Kehlani", "R&B/Soul")]);
  expect(await findArtistChoices("Kehlani")).toEqual([{ id: 1, name: "Kehlani", genre: "R&B/Soul" }]);
});

it("returns nothing when Apple can't answer", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 403 }));
  expect(await findArtistChoices("Bush")).toEqual([]);
});
