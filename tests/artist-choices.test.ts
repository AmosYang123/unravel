import { afterEach, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { findArtistChoices } from "../mobile/lib/music";

afterEach(() => vi.restoreAllMocks());

const deezer = (artists: unknown[]) =>
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: artists }), { status: 200 }));

it("offers every real artist with the same name, most followed first", async () => {
  deezer([
    { id: 11656353, name: "Bush", nb_fan: 16, nb_album: 31 },
    { id: 328834751, name: "Bush", nb_fan: 111, nb_album: 5 },
    { id: 1551, name: "Bush", nb_fan: 216726, nb_album: 48, picture_medium: "https://e-cdns-images.dzcdn.net/b.jpg" },
    { id: 1049, name: "Kate Bush", nb_fan: 398888, nb_album: 20 },
  ]);
  const choices = await findArtistChoices("bush");
  expect(choices.map((c) => c.id)).toEqual([1551, 328834751]);
  expect(choices[0].picture).toBe("https://e-cdns-images.dzcdn.net/b.jpg");
});

it("treats a name with a country tag as the same name", async () => {
  deezer([{ id: 415, name: "Nirvana", nb_fan: 10076635 }, { id: 281527041, name: "Nirvana (UK)", nb_fan: 231 }]);
  expect((await findArtistChoices("Nirvana")).length).toBe(2);
});

it("asks nothing when only one real artist has the name", async () => {
  deezer([{ id: 5603027, name: "Kehlani", nb_fan: 713426 }, { id: 413001151, name: "Kehlani", nb_fan: 1 }]);
  expect(await findArtistChoices("Kehlani")).toHaveLength(1);
});
