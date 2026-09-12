import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: db.from } }));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: { multiRemove: vi.fn() } }));
vi.mock("../mobile/lib/passcode", () => ({ uid: vi.fn() }));
afterEach(cleanup);
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function query(result: Promise<unknown>) {
  const chain = { insert: () => chain, single: () => chain, select: () => chain, eq: () => chain, is: () => chain, not: () => chain, order: () => chain, limit: () => chain, maybeSingle: () => chain, update: () => chain, then: result.then.bind(result) };
  return chain;
}
for (const platform of ["web", "mobile"]) {
  describe(`${platform} account data`, () => {
    it("ignores a pending load after sign-out", async () => {
      const store = platform === "web" ? await import("../src/lib/store") : await import("../mobile/lib/store");
      store.clearUserData();
      const pending = deferred<{ data: null; error: { message: string } }>();
      db.from.mockImplementation(() => query(pending.promise));
      const load = store.loadUserData("one");
      store.clearUserData();
      const { result } = renderHook(() => store.useSettings());
      await act(async () => {
        pending.resolve({ data: null, error: { message: "old request failed" } });
        await load;
      });
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.settings.lockEnabled).toBe(false);
    });
    it("does not put an old account's completed save into a new session", async () => {
      const store = platform === "web" ? await import("../src/lib/store") : await import("../mobile/lib/store");
      store.clearUserData();
      db.from.mockImplementation(() => query(Promise.resolve({ error: { message: "offline" }, data: null })));
      await store.loadUserData("one");
      const pending = deferred<{ error: null; data: null }>();
      db.from.mockImplementation(() => query(pending.promise));
      const { result } = renderHook(() => store.useEntries());
      const save = result.current.addEntry({ mode: "short", mood: 3, energy: 3, feelings: [], text: "Private words" });
      await act(async () => {
        store.clearUserData();
        pending.resolve({ error: null, data: null });
        await expect(save).rejects.toThrow("account changed");
      });
      expect(result.current.entries).toEqual([]);
      expect(result.current.entryCount).toBe(0);
    });
    it("does not expose a changed passcode until its save succeeds", async () => {
      const store = platform === "web" ? await import("../src/lib/store") : await import("../mobile/lib/store");
      store.clearUserData();
      db.from.mockImplementation(() => query(Promise.resolve({ error: { message: "offline" }, data: null })));
      await store.loadUserData("one");
      const save = deferred<{ error: { message: string } | null }>();
      db.from.mockImplementation(() => query(save.promise));
      const { result } = renderHook(() => store.useSettings());
      const update = result.current.update({ lockEnabled: true, passcode: "new hash" });
      expect(result.current.settings.lockEnabled).toBe(false);
      await act(async () => {
        save.resolve({ error: { message: "save failed" } });
        await expect(update).rejects.toThrow("save failed");
      });
      expect(result.current.settings.lockEnabled).toBe(false);
      expect(result.current.settings.passcode).toBe("");
    });
  });
}
