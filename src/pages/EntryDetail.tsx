import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Bookmark, FileText, Loader2, Plus, Trash2 } from "lucide-react";
import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import Aftercare from "@/components/Aftercare";
import { ENERGY_LABELS, MODE_META, MOOD_LABELS } from "@/lib/content";
import { fetchEntry, signedAudioUrl, useEntries, useSettings } from "@/lib/store";
import { transcribeVoiceMemo } from "@/lib/advice";
import type { Addendum, Entry } from "@/lib/types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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
    }[l] ?? l.toLowerCase()),
  "How crowded does your head feel?": (l) => `with ${l.toLowerCase()}`,
  "How are you feeling right now?": (l) => `feeling ${l.toLowerCase()}`,
  "How much energy do you have?": (l) =>
    ({
      Drained: "not much energy left",
      "Running low": "energy running low",
      "Enough to get by": "just enough energy to get by",
      "Pretty good": "decent energy",
      Energized: "energy to spare",
    }[l] ?? `with ${l.toLowerCase()}`),
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

const EntryDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
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
      <AppShell>
        <p className="text-sm text-muted-foreground">Opening…</p>
      </AppShell>
    );
  }

  if (!entry) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">
          This entry no longer exists.{" "}
          <Link to="/history" className="underline underline-offset-4">
            Back to timeline
          </Link>
          .
        </p>
      </AppShell>
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

  return (
    <AppShell>
      <div className="flex items-center justify-between">
        <Link
          to="/history"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Timeline
        </Link>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label={kept ? "Remove bookmark" : "Keep this one"}
            aria-pressed={kept}
            onClick={toggleKept}
          >
            <Bookmark className={cn("h-4 w-4", kept && "fill-current")} />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Delete entry">
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this entry?</AlertDialogTitle>
                <AlertDialogDescription>
                  This entry{entry.audioPath ? " and its voice recording" : ""} will be erased. This can't be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep it</AlertDialogCancel>
                <AlertDialogAction
                  disabled={deleting}
                  onClick={async () => {
                    setDeleting(true);
                    const deletedId = entry.id;
                    try {
                      await removeEntry(deletedId);
                      navigate("/history");
                      toast("Deleted. Undo", {
                        duration: 10000,
                        action: {
                          label: "Undo",
                          onClick: () => {
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
                  }}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <p className="eyebrow mt-8 text-accent">
        {new Date(entry.createdAt).toLocaleString(undefined, {
          weekday: "long",
          month: "long",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })}
      </p>
      {intent && <p className="mt-2 text-sm text-muted-foreground">{intent}</p>}
      {nightRecord && <p className="mt-1 text-sm text-muted-foreground">{nightRecord}</p>}

      <h1 className="page-title mt-3">{entry.title ?? MODE_META[entry.mode].label}</h1>
      <div className="page-underline mt-3" />

      <div className="mt-5 flex flex-wrap gap-2 text-sm">
        <span className="rounded-full border border-border/70 bg-gradient-to-b from-secondary to-muted px-3 py-1 font-medium">
          {moodLabel}
        </span>
        <span className="rounded-full border border-border/70 bg-gradient-to-b from-secondary to-muted px-3 py-1 font-medium">
          {energyLabel}
        </span>
        {entry.feelings.map((f) => (
          <span key={f} className="rounded-full border border-accent/40 bg-accent/12 px-3 py-1 font-medium">
            {f}
          </span>
        ))}
      </div>


      <div className="mt-8 space-y-5">
        {entry.prompt && (
          <p className="border-l-2 border-accent/50 pl-4 font-display text-lg italic text-muted-foreground">
            {entry.prompt}
          </p>
        )}
        {entry.text && <p className="whitespace-pre-wrap text-base leading-loose">{entry.text}</p>}
        {entry.addenda?.map((a, i) => (
          <div key={i}>
            <p className="text-xs text-muted-foreground">Added {formatAddendumDate(a.addedAt)}</p>
            <p className="mt-1 whitespace-pre-wrap text-base leading-loose">{a.text}</p>
          </div>
        ))}
        <div>
          {addingNote ? (
            <div className="space-y-2">
              <Textarea
                autoFocus
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                placeholder="Something to add…"
                className="min-h-24"
              />
              {noteError && <p className="text-sm text-destructive">{noteError}</p>}
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setAddingNote(false);
                    setNoteDraft("");
                    setNoteError(null);
                  }}
                  className="rounded-full"
                >
                  Cancel
                </Button>
                <Button
                  variant="secondary"
                  onClick={saveNote}
                  disabled={noteSaving || !noteDraft.trim()}
                  className="rounded-full"
                >
                  {noteSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="ghost" onClick={() => setAddingNote(true)} className="rounded-full text-muted-foreground">
              <Plus className="mr-2 h-4 w-4" /> Add something
            </Button>
          )}
        </div>
        {entry.bullets?.length ? (
          <ul className="space-y-2">
            {entry.bullets.map((b, i) => (
              <li key={i} className="flex gap-3 leading-relaxed">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent/70" />
                {b}
              </li>
            ))}
          </ul>
        ) : null}
        {entry.gratitude?.length ? (
          <ul className="space-y-2">
            {entry.gratitude.map((g, i) => (
              <li key={i} className="flex gap-3 leading-relaxed">
                <span className="font-display font-bold text-accent">{i + 1}</span>
                {g}
              </li>
            ))}
          </ul>
        ) : null}


        {entry.audioPath && (
          <div className="space-y-4">
            {audioUrl ? (
              <audio controls src={audioUrl} className="w-full max-w-sm" />
            ) : audioError ? (
              <p className="text-sm text-muted-foreground">
                The recording didn't load.{" "}
                <button
                  onClick={() => setAudioAttempt((n) => n + 1)}
                  className="underline underline-offset-4 hover:text-foreground"
                >
                  Try again
                </button>
                .
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Loading the recording…</p>
            )}

            {!entry.transcript && settings.aiSuggestionsEnabled && (
              <div>
                <Button
                  variant="secondary"
                  onClick={transcribe}
                  disabled={transcribing}
                  className="rounded-full"
                >
                  {transcribing ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <FileText className="mr-2 h-4 w-4" />
                  )}
                  {transcribing ? "Sending it off…" : isLong ? "Read it instead (with a recap)" : "Read it instead"}
                </Button>
                <p className="mt-2 text-xs text-muted-foreground">
                  {transcribing
                    ? "It can take a minute or two to come back, longer for a longer recording. You can keep reading while you wait."
                    : isLong
                      ? "Over five minutes, so you'll get a short recap plus the full text."
                      : "Turns this memo into text you can skim later."}
                </p>
              </div>
            )}

            {!entry.transcript && !settings.aiSuggestionsEnabled && (
              <p className="text-sm text-muted-foreground">
                Reading this back as text is off because it would send the recording to be transcribed. Turn AI
                suggestions back on in Settings to use it.
              </p>
            )}

            {transcribeError && <p className="text-sm text-destructive">{transcribeError}</p>}

            {entry.transcript && (
              <div className="surface p-5">
                {entry.transcriptSummary ? (
                  <>
                    <p className="eyebrow">Short recap</p>
                    <p className="mt-3 whitespace-pre-wrap text-base leading-relaxed">
                      {entry.transcriptSummary}
                    </p>
                    <button
                      onClick={() => setShowFull((v) => !v)}
                      className="mt-4 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
                    >
                      {showFull ? "Hide the full transcript" : "Read the full transcript"}
                    </button>
                    {showFull && (
                      <p className="mt-4 whitespace-pre-wrap border-t pt-4 text-sm leading-loose">
                        {entry.transcript}
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="eyebrow">Transcript</p>
                    <p className="mt-3 whitespace-pre-wrap text-base leading-loose">{entry.transcript}</p>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-12 border-t pt-10">
        <Aftercare entry={entry} revisit />
      </div>
    </AppShell>
  );
};

export default EntryDetail;
