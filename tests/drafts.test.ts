import { beforeEach, describe, expect, it, vi } from "vitest";
const storage = vi.hoisted(() => new Map<string, string>());
vi.mock("../mobile/node_modules/@react-native-async-storage/async-storage", () => ({ default: {
  getItem: async (key: string) => storage.get(key) ?? null,
} }));
import * as web from "../src/lib/drafts";
import * as native from "../mobile/lib/drafts";
const draft = { sliders: { mood: 3 }, text: "Private words", title: "", feelings: [], bullets: [""], gratitude: [], promptIndex: 0 };
beforeEach(() => { localStorage.clear(); storage.clear(); });
for (const [platform, module] of [["web", web], ["mobile", native]] as const) {
  describe(`${platform} drafts`, () => {
    const write = (key: string, value: string) => platform === "web" ? localStorage.setItem(key, value) : storage.set(key, value);
    it("never reads another account's draft or an unowned legacy draft", async () => {
      write(module.draftKey("short", "alice"), JSON.stringify(draft));
      write("quiet.draft.short.v1", JSON.stringify(draft));
      expect((await module.loadDraft("short", "alice"))?.text).toBe("Private words");
      expect(await module.loadDraft("short", "bob")).toBeNull();
      expect(await module.loadDraft("short", null)).toBeNull();
    });
    it("ignores corrupted shapes that would crash the editor", () => {
      for (const value of ["{", "null", "[]", JSON.stringify({ ...draft, text: 123 }), JSON.stringify({ ...draft, feelings: [3] }), JSON.stringify({ ...draft, promptIndex: -1 })]) {
        expect(module.parseDraft(value)).toBeNull();
      }
    });
    it("validates slider values while preserving the writing", () => {
      expect(module.parseDraft(JSON.stringify({ ...draft, sliders: { mood: 99, energy: 2.5 } }))?.sliders).toEqual({ energy: 3 });
    });
  });
}
