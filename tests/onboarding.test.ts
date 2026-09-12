import { describe, expect, it } from "vitest";
import { optionalSetupPatch, YEAR_LEVELS } from "../mobile/lib/onboarding";

describe("optional setup answers", () => {
  it("offers the four requested grade choices", () => {
    expect(YEAR_LEVELS.map((level) => level.label)).toEqual(["Prep", "Lower", "Upper", "Senior"]);
  });
  it("allows every answer to remain blank while completing setup", () => {
    expect(optionalSetupPatch({
      name: "",
      yearLevel: "",
      focusAreas: [],
      goals: [],
      interests: [],
      interestDraft: "",
    }, "2026-09-11T12:00:00.000Z")).toEqual({
      name: "",
      yearLevel: "",
      focusAreas: [],
      goals: [],
      interests: [],
      onboardedAt: "2026-09-11T12:00:00.000Z",
    });
  });

  it("includes a final typed interest when saving edits", () => {
    const patch = optionalSetupPatch({
      name: "  Sam  ",
      yearLevel: "senior",
      focusAreas: ["school"],
      goals: ["calm"],
      interests: ["drawing"],
      interestDraft: "  cooking  ",
    }, "done");
    expect(patch.name).toBe("Sam");
    expect(patch.interests).toEqual(["drawing", "cooking"]);
  });
});
