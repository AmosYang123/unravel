import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: db.from } }));
const nativeStorage = vi.hoisted(() => new Map<string, string>());
const mockAsyncStorage = vi.hoisted(() => () => ({ default: {
  getItem: async (key: string) => nativeStorage.get(key) ?? null,
  setItem: async (key: string, value: string) => { nativeStorage.set(key, value); },
  multiRemove: async (keys: string[]) => { for (const key of keys) nativeStorage.delete(key); },
} }));
vi.mock("@react-native-async-storage/async-storage", mockAsyncStorage);
vi.mock("../mobile/node_modules/@react-native-async-storage/async-storage", mockAsyncStorage);
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
    it("reports a write that changed no rows instead of a save", async () => {
      const store = platform === "web" ? await import("../src/lib/store") : await import("../mobile/lib/store");
      store.clearUserData();
      db.from.mockImplementation(() => query(Promise.resolve({ error: { message: "offline" }, data: null })));
      await store.loadUserData("one");
      const { result } = renderHook(() => store.useEntries());
      // The row is gone (deleted elsewhere, or hidden by RLS): no error, no rows touched.
      db.from.mockImplementation(() => query(Promise.resolve({ data: [], error: null })));
      const addenda = [{ text: "Add something", addedAt: "2026-01-01T00:00:00.000Z" }];
      await act(async () => {
        await expect(result.current.updateEntry("missing", { addenda })).rejects.toThrow("no longer there");
      });
      expect(result.current.entries).toEqual([]);
    });
    it("saves an addendum when the row is still there", async () => {
      const store = platform === "web" ? await import("../src/lib/store") : await import("../mobile/lib/store");
      store.clearUserData();
      db.from.mockImplementation(() => query(Promise.resolve({ error: { message: "offline" }, data: null })));
      await store.loadUserData("one");
      const { result } = renderHook(() => store.useEntries());
      db.from.mockImplementation(() => query(Promise.resolve({ data: { id: "e1", created_at: "2026-01-01T00:00:00.000Z", mode: "short", mood: 3, energy: 3 }, error: null })));
      await act(async () => {
        await result.current.addEntry({ mode: "short", mood: 3, energy: 3, feelings: [], text: "Private words" });
      });
      db.from.mockImplementation(() => query(Promise.resolve({ data: [{ id: "e1" }], error: null })));
      const addenda = [{ text: "Add something", addedAt: "2026-01-01T00:00:00.000Z" }];
      await act(async () => {
        await result.current.updateEntry("e1", { addenda });
      });
      expect(result.current.entries[0].addenda).toEqual(addenda);
    });
    it("leaves no unfinished writing behind on sign-out", async () => {
      const store = platform === "web" ? await import("../src/lib/store") : await import("../mobile/lib/store");
      const drafts = platform === "web" ? await import("../src/lib/drafts") : await import("../mobile/lib/drafts");
      const read = (key: string) => platform === "web" ? localStorage.getItem(key) : nativeStorage.get(key) ?? null;
      const write = (key: string, value: string) => platform === "web" ? localStorage.setItem(key, value) : void nativeStorage.set(key, value);
      store.clearUserData();
      db.from.mockImplementation(() => query(Promise.resolve({ error: { message: "offline" }, data: null })));
      await store.loadUserData("one");
      write(drafts.draftKey("short", "one"), JSON.stringify({ text: "Private words" }));
      write("quiet.sliders.one.short.v2", JSON.stringify({ mood: 3 }));
      write(drafts.draftKey("longform", "one"), JSON.stringify({ text: "More private words" }));
      store.clearUserData();
      await vi.waitFor(() => {
        expect(read(drafts.draftKey("short", "one"))).toBeNull();
        expect(read("quiet.sliders.one.short.v2")).toBeNull();
        expect(read(drafts.draftKey("longform", "one"))).toBeNull();
      });
    });
  });
}
