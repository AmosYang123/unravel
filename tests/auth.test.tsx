import { act, cleanup, renderHook } from "@testing-library/react";
import type { Session } from "@supabase/supabase-js";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({
  listener: undefined as ((event: string, session: Session | null) => void) | undefined,
  getSession: vi.fn(), load: vi.fn(), clear: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: {
  onAuthStateChange: (listener: typeof auth.listener) => { auth.listener = listener; return { data: { subscription: { unsubscribe: vi.fn() } } }; },
  getSession: auth.getSession, signOut: vi.fn(),
} } }));
vi.mock("@/lib/store", () => ({ loadUserData: auth.load, clearUserData: auth.clear }));
import { AuthProvider, useAuth } from "../src/lib/auth";
const session = (id: string) => ({ user: { id } }) as Session;
afterEach(cleanup);
beforeEach(() => { auth.load.mockClear(); auth.clear.mockClear(); });
it("does not reload the account on token refresh", async () => {
  auth.getSession.mockResolvedValue({ data: { session: null } });
  const { result } = renderHook(useAuth, { wrapper: AuthProvider });
  await act(async () => auth.listener?.("SIGNED_IN", session("one")));
  await act(async () => auth.listener?.("TOKEN_REFRESHED", session("one")));
  expect(auth.load).toHaveBeenCalledTimes(1);
  expect(result.current.user?.id).toBe("one");
});
it("ignores stale session restoration after a sign-out event", async () => {
  let resolve!: (value: { data: { session: Session } }) => void;
  auth.getSession.mockReturnValue(new Promise((done) => { resolve = done; }));
  const { result } = renderHook(useAuth, { wrapper: AuthProvider });
  await act(async () => auth.listener?.("SIGNED_OUT", null));
  await act(async () => resolve({ data: { session: session("old") } }));
  expect(result.current.session).toBeNull();
  expect(auth.load).not.toHaveBeenCalled();
});
