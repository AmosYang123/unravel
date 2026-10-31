import { expect, it, vi } from "vitest";
import { findArtistChoices } from "../mobile/lib/music";

it("does not send artist names to an external music catalogue", async () => {
  const request = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("must not be called"));
  expect(await findArtistChoices("private preference")).toEqual([]);
  expect(request).not.toHaveBeenCalled();
});
