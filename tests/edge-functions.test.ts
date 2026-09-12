import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn() }));

vi.mock("../mobile/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: mocks.getSession } },
}));

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("EXPO_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  mocks.getSession.mockResolvedValue({ data: { session: { access_token: "user-token" } }, error: null });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

it("sends the current user token to the Edge Function", async () => {
  const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ sent: true }), { status: 200 }),
  );
  const { invokeAuthedFunction } = await import("../mobile/lib/edgeFunctions");

  await expect(invokeAuthedFunction<{ sent: boolean }>("send-test-reminder")).resolves.toEqual({ sent: true });
  expect(request).toHaveBeenCalledWith(
    "https://project.supabase.co/functions/v1/send-test-reminder",
    expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ apikey: "sb_publishable_test", Authorization: "Bearer user-token" }),
    }),
  );
});

it("sends an explicit developer action body", async () => {
  const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ affected: 2 }), { status: 200 }),
  );
  const { invokeAuthedFunction } = await import("../mobile/lib/edgeFunctions");
  await invokeAuthedFunction("dev-control", { action: "reset" });
  expect(request.mock.calls[0][1]?.body).toBe('{"action":"reset"}');
});

it("retries one network failure and reports a clear connection error", async () => {
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Network request failed"));
  const { EdgeFunctionRequestError, invokeAuthedFunction } = await import("../mobile/lib/edgeFunctions");

  await expect(invokeAuthedFunction("send-test-reminder")).rejects.toEqual(
    new EdgeFunctionRequestError("Couldn't reach the reminder service. Check your connection and try again.", "network"),
  );
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("surfaces the function's configuration error without retrying", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ error: "Gmail authorization expired." }), { status: 500 }),
  );
  const { invokeAuthedFunction } = await import("../mobile/lib/edgeFunctions");

  await expect(invokeAuthedFunction("send-test-reminder")).rejects.toThrow("Gmail authorization expired.");
  expect(fetch).toHaveBeenCalledOnce();
});
