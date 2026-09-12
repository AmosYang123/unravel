import AsyncStorage from "@react-native-async-storage/async-storage";
import type { EntryMode } from "./types";

/** Everything about an in-progress draft that's plain data and safe to stash locally. */
export interface Draft {
  sliders: Record<string, number>;
  feelings: string[];
  text: string;
  title: string;
  bullets: string[];
  gratitude: string[];
  promptIndex: number;
  /** ISO, last time the draft actually changed. Drafts saved before this existed have none. */
  updatedAt?: string;
}

export const draftKey = (mode: EntryMode, userId: string | null | undefined) => {
  if (!userId) throw new Error("Not signed in.");
  return `quiet.draft.${userId}.${mode}.v2`;
};

/** Local data is untrusted; an old or damaged draft must not crash the editor. */
export function parseDraft(raw: string): Draft | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const draft = value as Record<string, unknown>;
    const strings = (input: unknown): input is string[] =>
      Array.isArray(input) && input.every((item) => typeof item === "string");
    if (typeof draft.text !== "string" || typeof draft.title !== "string" ||
        !strings(draft.feelings) || !strings(draft.bullets) || !strings(draft.gratitude) ||
        !draft.sliders || typeof draft.sliders !== "object" || Array.isArray(draft.sliders) ||
        typeof draft.promptIndex !== "number" || !Number.isInteger(draft.promptIndex) || draft.promptIndex < 0) return null;
    const sliders: Record<string, number> = {};
    for (const [key, value] of Object.entries(draft.sliders)) {
      if (typeof value === "number" && Number.isFinite(value) && value >= 1 && value <= 5) sliders[key] = Math.round(value);
    }
    return { sliders, feelings: draft.feelings, text: draft.text, title: draft.title,
      bullets: draft.bullets, gratitude: draft.gratitude, promptIndex: draft.promptIndex,
      updatedAt: typeof draft.updatedAt === "string" ? draft.updatedAt : undefined };
  } catch {
    return null;
  }
}

/** AsyncStorage has no synchronous read, so this returns a promise. */
export const loadDraft = async (mode: EntryMode, userId: string | null | undefined): Promise<Draft | null> => {
  try {
    if (!userId) return null;
    const raw = await AsyncStorage.getItem(draftKey(mode, userId));
    if (!raw) return null;
    return parseDraft(raw);
  } catch {
    return null;
  }
};

/** Words, not just a slider nudged. An empty draft is nothing to come back to. */
export const draftHasContent = (draft: Draft): boolean =>
  !!(
    draft.text?.trim() ||
    draft.title?.trim() ||
    draft.bullets?.some((b) => b.trim()) ||
    draft.gratitude?.some((g) => g.trim()) ||
    draft.feelings?.length
  );

/** Milliseconds since the draft last changed, or null if it never said. */
export const draftAge = (draft: Draft): number | null => {
  const at = draft.updatedAt ? Date.parse(draft.updatedAt) : NaN;
  return Number.isFinite(at) ? Date.now() - at : null;
};
