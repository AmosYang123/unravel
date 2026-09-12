import { describe, expect, it, vi } from "vitest";
import { hasSharingConsent } from "../supabase/functions/_shared/sharing-consent";

describe("server sharing consent", () => {
  it.each([
    [null, null, false],
    [{ ai_suggestions_enabled: true }, null, false],
    [{ ai_suggestions_enabled: true, ai_consent_version: "old" }, null, false],
    [{ ai_suggestions_enabled: false, ai_consent_version: "2026-09-11" }, null, false],
    [{ ai_suggestions_enabled: true, ai_consent_version: "2026-09-11" }, { message: "unavailable" }, false],
    [{ ai_suggestions_enabled: true, ai_consent_version: "2026-09-11" }, null, true],
  ])("requires the current notice and a successful profile read: %j", async (data, error, expected) => {
    const eq = vi.fn(() => ({ maybeSingle: async () => ({ data, error }) }));
    const client = { from: vi.fn(() => ({ select: () => ({ eq }) })) };
    expect(await hasSharingConsent(client, "caller-id")).toBe(expected);
    expect(eq).toHaveBeenCalledWith("id", "caller-id");
  });

  it("fails closed when the profile request throws", async () => {
    const client = { from: () => { throw new Error("offline"); } };
    expect(await hasSharingConsent(client, "caller-id")).toBe(false);
  });
});
