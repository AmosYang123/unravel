import { supportPlan } from "@/lib/content";
import type { SupportPlan } from "@/lib/content";
import type { Entry } from "@/lib/types";

export async function fetchEntryAdvice(
  entry: Entry,
  variation = 0,
  _onTranscribed?: (result: { transcript: string; summary: string | null }) => void | Promise<void>,
): Promise<SupportPlan> {
  const plan = supportPlan(entry, variation);
  return { ...plan, basis: `created on-device from this entry (${plan.basis})` };
}

export async function transcribeVoiceMemo(_entryId: string): Promise<{ transcript: string; summary: string | null }> {
  throw new Error("Voice transcription is not available. Your recording remains in your private journal.");
}
