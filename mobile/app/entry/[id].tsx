import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Bookmark, FileText, Plus, Trash2 } from "lucide-react-native";
import Aftercare from "@/components/Aftercare";
import { AudioPlayer, Button, ConfirmDialog, PageTitle, PageUnderline, toast, withAlpha } from "@/components/ui";
import { ENERGY_LABELS, MODE_META, MOOD_LABELS } from "@/lib/content";
import { fetchEntry, signedAudioUrl, useEntries, useSettings } from "@/lib/store";
import { transcribeVoiceMemo } from "@/lib/advice";
import type { Addendum, Entry } from "@/lib/types";
import { useStyles, useTheme } from "@/theme/ThemeProvider";
import type { FontSet } from "@/theme/tokens";

const LONG_MEMO_SECONDS = 300;

/**
 * Each format's pre-writing sliders ask their own question. This maps the exact
 * question text (see MODE_SLIDERS in lib/content.ts) to a clause that reads
 * naturally after "you came in ", so several answers can be strung into one
 * quiet sentence instead of shown as a question/answer list.
 */
const INTENT_CLAUSES: Record<string, (label: string) => string> = {
  "How much do you want to get into right now?": (l) =>
    `wanting to ${
      {
        "Surface only": "keep things on the surface",
        "A little": "share only a little",
        "In between": "go partway in",
        "Fairly deep": "get fairly deep into it",
        "All the way in": "get all the way into it",
      }[l] ?? l.toLowerCase()
    }`,
  "How clear are your thoughts?": (l) => `with thoughts that felt ${l.toLowerCase()}`,
  "How easy does it feel to talk about this?": (l) =>
    ({
      "Hard to say": "finding this hard to say out loud",
      "Takes effort": "finding this took some effort to say",
      "In between": "in two minds about saying it out loud",
      "Mostly ready": "feeling mostly ready to talk",
      "Ready to talk": "feeling ready to talk",
    })[l] ?? l.toLowerCase(),
  "How crowded does your head feel?": (l) => `with ${l.toLowerCase()}`,
  "How are you feeling right now?": (l) => `feeling ${l.toLowerCase()}`,
  "How much energy do you have?": (l) =>
    ({
      Drained: "not much energy left",
      "Running low": "energy running low",
      "Enough to get by": "just enough energy to get by",
      "Pretty good": "decent energy",
      Energized: "energy to spare",
    })[l] ?? `with ${l.toLowerCase()}`,
  "How stuck are you on what to say?": (l) =>
    `with ${
      {
        "I know what I want to say": "a clear idea of what to say",
        "Roughly know": "a rough idea of what to say",
        "Some idea": "some idea where to start",
        "Not much of an idea": "not much idea where to start",
        "No idea where to start": "no idea where to start",
      }[l] ?? l.toLowerCase()
    }`,
  "How deep do you want the questions to go?": (l) =>
    `wanting the questions to ${
      {
        "Keep it light": "stay light",
        "Fairly light": "stay fairly light",
        "In between": "go partway deep",
        "A bit deeper": "go a bit deeper",
        "Let's go deeper": "go deep",
      }[l] ?? l.toLowerCase()
    }`,
  "How has today been?": (l) => `on a ${l.toLowerCase()} day`,
  "How much is on your mind right now?": (l) => `with ${l.toLowerCase()} on your mind`,
};

/** Turns the stored "question → answer" strings into one quiet sentence about the night. */
function intentLine(intent: string[] | undefined): string | null {
  if (!intent?.length) return null;
  const clauses = intent
    .map((line) => {
      const [question, answer] = line.split(" → ");
      if (!question || !answer) return null;
      return INTENT_CLAUSES[question.trim()]?.(answer.trim()) ?? null;
    })
    .filter((c): c is string => c !== null);
  if (!clauses.length) return null;
  return `you came in ${clauses.join(", and ")}.`;
}

/** What happened that night besides the words — a song, a breathing session, or both. */
function nightRecordLine(entry: Entry): string | null {
  const pick = entry.songId ? entry.songs?.picks.find((p) => p.id === entry.songId) : undefined;
  if (pick && entry.breathed) return `You played "${pick.title}" by ${pick.artist}, and took a moment to breathe.`;
  if (pick) return `You played "${pick.title}" by ${pick.artist}.`;
  if (entry.breathed) return "You took a moment to breathe.";
  return null;
}

/** Formats an addendum's `addedAt` for display, same register as the entry's own date line. */
function formatAddendumDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function EntryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { theme } = useTheme();
  const styles = useStyles(createStyles);
  const { entries, loading, removeEntry, restoreEntry, updateEntry, setKept } = useEntries();
  const { settings } = useSettings();
  const stored = entries.find((e) => e.id === id);
  // An entry older than the loaded pages is fetched on its own. `fetched` holds
  // the answer for one id, including "there is no such entry" as a null entry,
  // so the page can tell a fetch in flight from a genuine miss.
  const [fetched, setFetched] = useState<{ id: string; entry: Entry | null } | null>(null);
  const resolved = fetched && fetched.id === id ? fetched : null;
  const entry = stored ?? resolved?.entry ?? undefined;

  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioError, setAudioError] = useState(false);
  const [audioAttempt, setAudioAttempt] = useState(0);
  const [transcribing, setTranscribing] = useState(false);
  const [transcribeError, setTranscribeError] = useState<string | null>(null);
  const [showFull, setShowFull] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [kept, setKeptDisplay] = useState(false);
  const [addingNote, setAddingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  useEffect(() => {
    setKeptDisplay(entry?.kept ?? false);
  }, [entry?.kept]);

  useEffect(() => {
    if (!id || stored || resolved || loading) return;
    let cancelled = false;
    fetchEntry(id)
      .then((found) => {
        if (!cancelled) setFetched({ id, entry: found });
      })
      .catch(() => {
        if (!cancelled) setFetched({ id, entry: null });
      });
    return () => {
      cancelled = true;
    };
  }, [id, stored, resolved, loading]);

  /** An entry held only here, outside `entries`, has to be kept in step with its own edits. */
  const applyLocalPatch = (patch: Partial<Entry>) =>
    setFetched((current) =>
      current && current.id === id && current.entry
        ? { id: current.id, entry: { ...current.entry, ...patch } }
        : current,
    );

  useEffect(() => {
    let cancelled = false;
    if (entry?.audioPath) {
      setAudioError(false);
      signedAudioUrl(entry.audioPath)
        .then((url) => {
          if (!cancelled) setAudioUrl(url);
        })
        .catch(() => {
          if (!cancelled) setAudioError(true);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [entry?.audioPath, audioAttempt]);

  // Never call it missing while the journal is loading or the by-id fetch is in flight.
  if (!entry && id && (loading || !resolved)) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]} edges={["top"]}>
        <Text style={[styles.muted, styles.pad]}>Opening…</Text>
      </SafeAreaView>
    );
  }

  if (!entry) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]} edges={["top"]}>
        <Text style={[styles.muted, styles.pad, { color: theme.colors.mutedForeground }]}>
          This entry no longer exists.{" "}
          <Link href="/history" dismissTo style={styles.link}>
            Back to timeline
          </Link>
          <Text>.</Text>
        </Text>
      </SafeAreaView>
    );
  }

  const isLong = (entry.audioSeconds ?? 0) > LONG_MEMO_SECONDS;
  const moodLabel = MOOD_LABELS[Math.min(Math.max(entry.mood, 1), MOOD_LABELS.length) - 1];
  const energyLabel = ENERGY_LABELS[Math.min(Math.max(entry.energy, 1), ENERGY_LABELS.length) - 1];
  const intent = intentLine(entry.intent);
  const nightRecord = nightRecordLine(entry);

  const toggleKept = async () => {
    const next = !kept;
    setKeptDisplay(next);
    try {
      await setKept(entry.id, next);
      applyLocalPatch({ kept: next });
    } catch (err) {
      setKeptDisplay(!next);
      toast(err instanceof Error ? err.message : "That didn't save just now.");
    }
  };

  const saveNote = async () => {
    const body = noteDraft.trim();
    if (!body) return;
    setNoteSaving(true);
    setNoteError(null);
    try {
      const addendum: Addendum = { text: body, addedAt: new Date().toISOString() };
      const addenda = [...(entry.addenda ?? []), addendum];
      await updateEntry(entry.id, { addenda });
      applyLocalPatch({ addenda });
      setNoteDraft("");
      setAddingNote(false);
    } catch (err) {
      setNoteError(err instanceof Error ? err.message : "That didn't save just now.");
    } finally {
      setNoteSaving(false);
    }
  };

  const transcribe = async () => {
    setTranscribing(true);
    setTranscribeError(null);
    try {
      const result = await transcribeVoiceMemo(entry.id);
      const transcribed: Partial<Entry> = {
        transcript: result.transcript,
        transcriptSummary: result.summary ?? undefined,
        transcriptStatus: "done",
      };
      await updateEntry(entry.id, transcribed);
      applyLocalPatch(transcribed);
    } catch (err) {
      setTranscribeError(err instanceof Error ? err.message : "That didn't work just now.");
    } finally {
      setTranscribing(false);
    }
  };

  const confirmDelete = async () => {
    setDeleting(true);
    const deletedId = entry.id;
    try {
      await removeEntry(deletedId);
      setConfirmOpen(false);
      router.replace("/history");
      toast("Deleted. Undo", {
        duration: 10000,
        action: {
          label: "Undo",
          onPress: () => {
            restoreEntry(deletedId).catch((err) => {
              toast(err instanceof Error ? err.message : "Couldn't undo that.");
            });
          },
        },
      });
    } catch (err) {
      toast(err instanceof Error ? err.message : "That didn't work just now.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.topRow}>
          <Link href="/history" dismissTo asChild>
            <Pressable style={styles.backLink} hitSlop={6}>
              <ArrowLeft size={16} color={theme.colors.mutedForeground} strokeWidth={1.75} />
              <Text style={[styles.backLinkText, { color: theme.colors.mutedForeground }]}>Timeline</Text>
            </Pressable>
          </Link>
          <View style={styles.topActions}>
            <Pressable
              onPress={toggleKept}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={kept ? "Remove bookmark" : "Keep this one"}
              accessibilityState={{ selected: kept }}
              style={styles.iconButton}
            >
              <Bookmark
                size={18}
                color={theme.colors.foreground}
                fill={kept ? theme.colors.foreground : "none"}
                strokeWidth={1.75}
              />
            </Pressable>
            <Pressable
              onPress={() => setConfirmOpen(true)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Delete entry"
              style={styles.iconButton}
            >
              <Trash2 size={18} color={theme.colors.foreground} strokeWidth={1.75} />
            </Pressable>
          </View>
        </View>

        <Text style={[styles.eyebrow, { color: theme.colors.accent }]}>
          {new Date(entry.createdAt).toLocaleString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
        </Text>
        {Boolean(intent) && <Text style={[styles.metaLine, { color: theme.colors.mutedForeground }]}>{intent}</Text>}
        {nightRecord && (
          <Text style={[styles.metaLine, { color: theme.colors.mutedForeground }]}>{nightRecord}</Text>
        )}

        <PageTitle style={styles.title}>{entry.title ?? MODE_META[entry.mode].label}</PageTitle>
        <PageUnderline style={styles.underline} />

        <View style={styles.badgeRow}>
          <View
            style={[
              styles.badge,
              { borderColor: withAlpha(theme.colors.border, 0.7), backgroundColor: theme.colors.secondary },
            ]}
          >
            <Text style={[styles.badgeText, { color: theme.colors.secondaryForeground }]}>{moodLabel}</Text>
          </View>
          <View
            style={[
              styles.badge,
              { borderColor: withAlpha(theme.colors.border, 0.7), backgroundColor: theme.colors.secondary },
            ]}
          >
            <Text style={[styles.badgeText, { color: theme.colors.secondaryForeground }]}>{energyLabel}</Text>
          </View>
          {entry.feelings.map((f) => (
            <View
              key={f}
              style={[
                styles.badge,
                { borderColor: withAlpha(theme.colors.accent, 0.4), backgroundColor: withAlpha(theme.colors.accent, 0.12) },
              ]}
            >
              <Text style={[styles.badgeText, { color: theme.colors.foreground }]}>{f}</Text>
            </View>
          ))}
        </View>

        <View style={styles.body}>
          {Boolean(entry.prompt) && (
            <Text
              style={[
                styles.prompt,
                { color: theme.colors.mutedForeground, borderLeftColor: withAlpha(theme.colors.accent, 0.5) },
              ]}
            >
              {entry.prompt}
            </Text>
          )}
          {Boolean(entry.text) && <Text style={[styles.entryText, { color: theme.colors.foreground }]}>{entry.text}</Text>}

          {entry.addenda?.map((a, i) => (
            <View key={i}>
              <Text style={[styles.addendumDate, { color: theme.colors.mutedForeground }]}>
                Added {formatAddendumDate(a.addedAt)}
              </Text>
              <Text style={[styles.entryText, styles.addendumText, { color: theme.colors.foreground }]}>
                {a.text}
              </Text>
            </View>
          ))}

          {addingNote ? (
            <View style={styles.noteForm}>
              <TextInput
                autoFocus
                multiline
                value={noteDraft}
                onChangeText={setNoteDraft}
                placeholder="Something to add…"
                placeholderTextColor={theme.colors.mutedForeground}
                style={[
                  styles.noteInput,
                  {
                    color: theme.colors.foreground,
                    borderColor: withAlpha(theme.colors.border, 0.7),
                    backgroundColor: theme.colors.card,
                  },
                ]}
              />
              {noteError && <Text style={[styles.errorText, { color: theme.colors.destructive }]}>{noteError}</Text>}
              <View style={styles.noteActions}>
                <Button
                  variant="ghost"
                  label="Cancel"
                  onPress={() => {
                    setAddingNote(false);
                    setNoteDraft("");
                    setNoteError(null);
                  }}
                />
                <Button
                  variant="filled"
                  label={noteSaving ? "Saving…" : "Save"}
                  onPress={saveNote}
                  disabled={noteSaving || !noteDraft.trim()}
                />
              </View>
            </View>
          ) : (
            <Button
              variant="ghost"
              label="Add something"
              icon={<Plus size={16} color={theme.colors.mutedForeground} strokeWidth={1.75} />}
              onPress={() => setAddingNote(true)}
              style={styles.addButton}
            />
          )}

          {!!entry.bullets?.length && (
            <View style={styles.list}>
              {entry.bullets.map((b, i) => (
                <View key={i} style={styles.listRow}>
                  <View style={[styles.bulletDot, { backgroundColor: withAlpha(theme.colors.accent, 0.7) }]} />
                  <Text style={[styles.listText, { color: theme.colors.foreground }]}>{b}</Text>
                </View>
              ))}
            </View>
          )}

          {!!entry.gratitude?.length && (
            <View style={styles.list}>
              {entry.gratitude.map((g, i) => (
                <View key={i} style={styles.listRow}>
                  <Text style={[styles.gratitudeIndex, { color: theme.colors.accent }]}>{i + 1}</Text>
                  <Text style={[styles.listText, { color: theme.colors.foreground }]}>{g}</Text>
                </View>
              ))}
            </View>
          )}

          {Boolean(entry.audioPath) && (
            <View style={styles.audioBlock}>
              {audioUrl ? (
                <AudioPlayer uri={audioUrl} label="your recording" />
              ) : audioError ? (
                <Text style={[styles.muted, { color: theme.colors.mutedForeground }]}>
                  The recording didn't load.{" "}
                  <Text
                    onPress={() => setAudioAttempt((n) => n + 1)}
                    style={[styles.link, { color: theme.colors.foreground }]}
                  >
                    Try again
                  </Text>
                  .
                </Text>
              ) : (
                <Text style={[styles.muted, { color: theme.colors.mutedForeground }]}>Loading the recording…</Text>
              )}

              {!entry.transcript && settings.aiSuggestionsEnabled && (
                <View>
                  <Button
                    variant="filled"
                    label={transcribing ? "Sending it off…" : isLong ? "Read it instead (with a recap)" : "Read it instead"}
                    onPress={transcribe}
                    disabled={transcribing}
                    icon={
                      transcribing ? (
                        <ActivityIndicator size="small" color={theme.colors.primaryForeground} />
                      ) : (
                        <FileText size={16} color={theme.colors.primaryForeground} strokeWidth={1.75} />
                      )
                    }
                  />
                  <Text style={[styles.noteHint, { color: theme.colors.mutedForeground }]}>
                    {transcribing
                      ? "It can take a minute or two to come back, longer for a longer recording. You can keep reading while you wait."
                      : isLong
                        ? "Over five minutes, so you'll get a short recap plus the full text."
                        : "Turns this memo into text you can skim later."}
                  </Text>
                </View>
              )}

              {!entry.transcript && !settings.aiSuggestionsEnabled && (
                <Text style={[styles.muted, { color: theme.colors.mutedForeground }]}>
                  Reading this back as text is off because it would send the recording to be transcribed. Turn AI
                  suggestions back on in Settings to use it.
                </Text>
              )}

              {transcribeError && (
                <Text style={[styles.errorText, { color: theme.colors.destructive }]}>{transcribeError}</Text>
              )}

              {Boolean(entry.transcript) && (
                <View
                  style={[
                    styles.transcriptCard,
                    { backgroundColor: theme.colors.card, borderColor: withAlpha(theme.colors.border, 0.7) },
                  ]}
                >
                  {entry.transcriptSummary ? (
                    <>
                      <Text style={[styles.eyebrowSmall, { color: theme.colors.mutedForeground }]}>Short recap</Text>
                      <Text style={[styles.entryText, { color: theme.colors.foreground }]}>
                        {entry.transcriptSummary}
                      </Text>
                      <Pressable onPress={() => setShowFull((v) => !v)} hitSlop={6}>
                        <Text style={[styles.link, styles.noteHint, { color: theme.colors.mutedForeground }]}>
                          {showFull ? "Hide the full transcript" : "Read the full transcript"}
                        </Text>
                      </Pressable>
                      {showFull && (
                        <Text
                          style={[
                            styles.entryText,
                            styles.fullTranscript,
                            { color: theme.colors.foreground, borderTopColor: withAlpha(theme.colors.border, 0.7) },
                          ]}
                        >
                          {entry.transcript}
                        </Text>
                      )}
                    </>
                  ) : (
                    <>
                      <Text style={[styles.eyebrowSmall, { color: theme.colors.mutedForeground }]}>Transcript</Text>
                      <Text style={[styles.entryText, { color: theme.colors.foreground }]}>{entry.transcript}</Text>
                    </>
                  )}
                </View>
              )}
            </View>
          )}
        </View>

        <View style={[styles.aftercareWrap, { borderTopColor: withAlpha(theme.colors.border, 0.7) }]}>
          <Aftercare entry={entry} revisit />
        </View>
      </ScrollView>

      <ConfirmDialog
        visible={confirmOpen}
        title="Delete this entry?"
        description={`This entry${entry.audioPath ? " and its voice recording" : ""} will be erased. This can't be undone.`}
        confirmLabel="Delete"
        cancelLabel="Keep it"
        destructive
        onConfirm={() => {
          if (!deleting) void confirmDelete();
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </SafeAreaView>
  );
}

const createStyles = (fonts: FontSet) => StyleSheet.create({
  safe: { flex: 1 },
  scroll: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 48 },
  pad: { paddingHorizontal: 20, paddingTop: 24 },
  muted: { fontFamily: fonts.body, fontSize: 14 },
  link: { textDecorationLine: "underline" },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  backLink: { flexDirection: "row", alignItems: "center", gap: 8 },
  backLinkText: { fontFamily: fonts.body, fontSize: 14 },
  topActions: { flexDirection: "row", alignItems: "center", gap: 4 },
  iconButton: { padding: 8, borderRadius: 999 },
  eyebrow: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    letterSpacing: 1.6,
    textTransform: "uppercase",
    marginTop: 28,
  },
  metaLine: { fontFamily: fonts.body, fontSize: 14, marginTop: 6 },
  title: { marginTop: 10 },
  underline: { marginTop: 12 },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 18 },
  badge: { borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 6 },
  badgeText: { fontFamily: fonts.bodySemiBold, fontSize: 13 },
  body: { marginTop: 28, gap: 18 },
  prompt: {
    fontFamily: fonts.displayMedium,
    fontStyle: "italic",
    fontSize: 17,
    lineHeight: 25,
    borderLeftWidth: 2,
    paddingLeft: 14,
  },
  entryText: { fontFamily: fonts.body, fontSize: 16, lineHeight: 26 },
  addendumDate: { fontFamily: fonts.body, fontSize: 12 },
  addendumText: { marginTop: 4 },
  noteForm: { gap: 10 },
  noteInput: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22,
    minHeight: 96,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    textAlignVertical: "top",
  },
  noteActions: { flexDirection: "row", gap: 8 },
  addButton: { alignSelf: "flex-start", paddingHorizontal: 12 },
  errorText: { fontFamily: fonts.body, fontSize: 13 },
  list: { gap: 10 },
  listRow: { flexDirection: "row", gap: 12 },
  bulletDot: { width: 6, height: 6, borderRadius: 3, marginTop: 9 },
  gratitudeIndex: { fontFamily: fonts.display, fontSize: 15 },
  listText: { flex: 1, fontFamily: fonts.body, fontSize: 15, lineHeight: 23 },
  audioBlock: { gap: 16 },
  noteHint: { fontFamily: fonts.body, fontSize: 12, marginTop: 8 },
  transcriptCard: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, padding: 18, gap: 12 },
  eyebrowSmall: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    letterSpacing: 1.6,
    textTransform: "uppercase",
  },
  fullTranscript: { marginTop: 12, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth },
  aftercareWrap: { marginTop: 36, paddingTop: 28, borderTopWidth: StyleSheet.hairlineWidth },
});
