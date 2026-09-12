import type { Entry, Settings } from "@/lib/types";

/** Builds the plain-text export: preferences first, then every entry, newest first. */
export function buildJournalExport(entries: Entry[], settings: Settings, email?: string): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(undefined, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  const MODE_LABEL: Record<string, string> = {
    longform: "Long-form writing",
    short: "Short note",
    bullets: "Bullet dump",
    voice: "Voice memo",
    mood: "Mood check-in",
    prompt: "Guided prompt",
    gratitude: "Gratitude",
  };
  const L = ["1 (lowest)", "2", "3", "4", "5 (highest)"];
  const lines: string[] = [];

  lines.push("UNRAVEL — YOUR JOURNAL EXPORT");
  lines.push("=".repeat(60));
  lines.push(`Exported: ${fmt(new Date().toISOString())}`);
  lines.push(`Account: ${email ?? "—"}`);
  lines.push(`Total entries: ${entries.length}`);
  lines.push("");
  lines.push("This file is yours. Nothing here is shared with anyone.");
  lines.push("");
  lines.push("-".repeat(60));
  lines.push("PART 1 — YOUR PREFERENCES");
  lines.push("-".repeat(60));
  lines.push(`Name: ${settings.name || "(not set)"}`);
  lines.push(`Theme: ${settings.theme}`);
  lines.push(`Fonts: ${settings.displayFont} (headings) / ${settings.bodyFont} (body)`);
  lines.push(`Check-in rhythm: ${settings.reminderMode}`);
  lines.push(`Reminder time: ${settings.reminderTime} (${settings.timezone})`);
  lines.push(`Email reminders: ${settings.reminderEmails ? "on" : "off"}`);
  lines.push(`Music genres: ${settings.musicTastes.join(", ") || "(none)"}`);
  lines.push(`Favourite artists: ${settings.musicArtists.join(", ") || "(none)"}`);
  lines.push(`Passcode lock: ${settings.lockEnabled ? "on" : "off"}`);
  lines.push("");
  lines.push("-".repeat(60));
  lines.push(`PART 2 — YOUR ENTRIES (newest first)`);
  lines.push("-".repeat(60));

  const sorted = [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (sorted.length === 0) lines.push("", "No entries yet.");

  sorted.forEach((e, i) => {
    lines.push("");
    lines.push(`ENTRY ${i + 1} of ${sorted.length} — ${fmt(e.createdAt)}`);
    lines.push(`Format: ${MODE_LABEL[e.mode] ?? e.mode}`);
    if (e.title) lines.push(`Title: ${e.title}`);
    lines.push(`Mood: ${L[e.mood - 1] ?? e.mood}   Energy: ${L[e.energy - 1] ?? e.energy}`);
    if (e.feelings?.length) lines.push(`Feelings: ${e.feelings.join(", ")}`);
    if (e.prompt) lines.push(`Prompt: ${e.prompt}`);
    if (e.text) {
      lines.push("");
      lines.push("What you wrote:");
      e.text.split("\n").forEach((l) => lines.push(`  ${l}`));
    }
    if (e.bullets?.length) {
      lines.push("");
      lines.push("Bullets:");
      e.bullets.forEach((b) => lines.push(`  • ${b}`));
    }
    if (e.gratitude?.length) {
      lines.push("");
      lines.push("Grateful for:");
      e.gratitude.forEach((g) => lines.push(`  • ${g}`));
    }
    if (e.audioPath) {
      lines.push("");
      lines.push(
        `Voice memo: ${e.audioSeconds ? `${Math.round(e.audioSeconds / 60)} min ${e.audioSeconds % 60}s` : "recorded"} (audio stays in the app)`,
      );
      if (e.transcriptSummary) {
        lines.push("Summary:");
        e.transcriptSummary.split("\n").forEach((l) => lines.push(`  ${l}`));
      }
      if (e.transcript) {
        lines.push("Transcript:");
        e.transcript.split("\n").forEach((l) => lines.push(`  ${l}`));
      }
    }
    lines.push("");
    lines.push("-".repeat(60));
  });

  return lines.join("\n");
}
