import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Loader2, Plus, Shuffle, X } from "lucide-react";
import { toast } from "sonner";
import AppShell from "@/components/AppShell";
import CheckInSliders from "@/components/CheckInSliders";
import VoiceRecorder, { type Recording } from "@/components/VoiceRecorder";
import Aftercare, { warmAftercare } from "@/components/Aftercare";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { MODE_META, MODE_SLIDERS, modeGlyphStyle, PROMPTS } from "@/lib/content";
import { draftAge, draftHasContent, draftKey, loadDraft, type Draft } from "@/lib/drafts";
import type { Entry, EntryMode, NewEntry } from "@/lib/types";
import { uploadVoiceMemo, useEntries, useSettings } from "@/lib/store";
import { useAuth } from "@/lib/auth";


const isMode = (v: string | null): v is EntryMode =>
  !!v && Object.prototype.hasOwnProperty.call(MODE_META, v);

const STALE_DRAFT_MS = 3 * 24 * 60 * 60 * 1000;

/** Where each mode's sliders were left, kept apart from the draft itself. */
const sliderMemoryKey = (mode: EntryMode, userId: string | undefined) => `quiet.sliders.${userId}.${mode}.v2`;

const loadSliderMemory = (mode: EntryMode, userId: string | undefined): Record<string, number> => {
  try {
    const raw = localStorage.getItem(sliderMemoryKey(mode, userId));
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object") return {};
    const remembered: Record<string, number> = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "number" && value >= 1 && value <= 5) remembered[id] = Math.round(value);
    }
    return remembered;
  } catch {
    return {};
  }
};

const rememberSliders = (mode: EntryMode, values: Record<string, number>, userId: string | undefined) => {
  try {
    localStorage.setItem(sliderMemoryKey(mode, userId), JSON.stringify(values));
  } catch {
    // ignore storage failures (e.g. private browsing, full quota)
  }
};

const Compose = () => {
  const [params] = useSearchParams();
  const mode: EntryMode = isMode(params.get("mode")) ? (params.get("mode") as EntryMode) : "short";
  // Remount the form whenever the mode changes so slider ids and any draft always match it.
  return <ComposeForm key={mode} mode={mode} />;
};

const ComposeForm = ({ mode }: { mode: EntryMode }) => {
  const navigate = useNavigate();
  const meta = MODE_META[mode];
  const { entries, addEntry, updateEntry } = useEntries();
  const { settings } = useSettings();
  const { user } = useAuth();

  const specs = MODE_SLIDERS[mode] ?? [];
  const [initialDraft] = useState(() => loadDraft(mode, user?.id));
  const [remembered] = useState(() => loadSliderMemory(mode, user?.id));

  const [sliders, setSliders] = useState<Record<string, number>>(() =>
    Object.fromEntries(specs.map((s) => [s.id, initialDraft?.sliders?.[s.id] ?? remembered[s.id] ?? 3])),
  );
  // True only while the carried-over values are still untouched.
  const [carried, setCarried] = useState(() =>
    specs.some((s) => initialDraft?.sliders?.[s.id] === undefined && remembered[s.id] !== undefined),
  );

  const [feelings, setFeelings] = useState<string[]>(() => initialDraft?.feelings ?? []);
  const [text, setText] = useState(() => initialDraft?.text ?? "");
  const [title, setTitle] = useState(() => initialDraft?.title ?? "");
  const [bullets, setBullets] = useState<string[]>(() => initialDraft?.bullets ?? [""]);
  const [gratitude, setGratitude] = useState<string[]>(() => initialDraft?.gratitude ?? ["", "", ""]);
  const [audio, setAudio] = useState<{ recording?: Recording; seconds: number }>({ seconds: 0 });
  const [promptIndex, setPromptIndex] = useState(
    () => initialDraft?.promptIndex ?? Math.floor(Math.random() * PROMPTS.length),
  );
  const [saved, setSaved] = useState<Entry | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const lastWritten = useRef<string | null>(null);

  // Autosave the draft (audio can't be serialized, so voice recordings aren't included).
  useEffect(() => {
    const draft: Draft = { sliders, feelings, text, title, bullets, gratitude, promptIndex };
    const body = JSON.stringify(draft);
    const previous = lastWritten.current;
    lastWritten.current = body;
    // Nothing changed, or the page just opened an existing draft — neither counts
    // as touching it, so the timestamp stays where it was.
    if (body === previous) return;
    if (previous === null && initialDraft) return;
    try {
      localStorage.setItem(draftKey(mode, user?.id), JSON.stringify({ ...draft, updatedAt: new Date().toISOString() }));
    } catch {
      // ignore storage failures (e.g. private browsing, full quota)
    }
  }, [mode, user?.id, initialDraft, sliders, feelings, text, title, bullets, gratitude, promptIndex]);

  // A draft nobody has come back to in days gets a line, never a nudge.
  const [restedDraft] = useState(() => {
    const age = initialDraft ? draftAge(initialDraft) : null;
    return !!initialDraft && draftHasContent(initialDraft) && age !== null && age > STALE_DRAFT_MS;
  });

  const prompt = PROMPTS[promptIndex];

  const canSave = useMemo(() => {
    if (mode === "mood") return true;
    if (mode === "voice") return !!audio.recording;
    if (mode === "bullets") return bullets.some((b) => b.trim());
    if (mode === "gratitude") return gratitude.some((g) => g.trim());
    return text.trim().length > 0;
  }, [mode, audio.recording, bullets, gratitude, text]);

  // Same check, used to decide whether leaving needs a confirmation.
  const hasContent = canSave;

  const save = async () => {
    if (!user || saving || !canSave) return;
    setSaving(true);
    setSaveError(null);
    try {
      let audioPath: string | undefined;
      if (mode === "voice" && audio.recording) {
        audioPath = await uploadVoiceMemo(user.id, audio.recording.blob, audio.recording.mimeType);
      }

      const bound = (field: "mood" | "energy") => {
        const spec = specs.find((s) => s.field === field);
        return spec ? sliders[spec.id] ?? 3 : 3;
      };

      const intent = specs.map((s) => `${s.question} → ${s.steps[(sliders[s.id] ?? 3) - 1]}`);

      const draft: NewEntry = {
        mode,
        mood: bound("mood"),
        energy: bound("energy"),
        feelings,
        intent: intent.length ? intent : undefined,

        title: title.trim() || undefined,
        text: text.trim() || undefined,
        bullets: mode === "bullets" ? bullets.map((b) => b.trim()).filter(Boolean) : undefined,
        gratitude: mode === "gratitude" ? gratitude.map((g) => g.trim()).filter(Boolean) : undefined,
        prompt: mode === "prompt" ? prompt : undefined,
        audioPath,
        audioSeconds: audioPath ? audio.seconds : undefined,
      };

      const entry = await addEntry(draft);
      try { localStorage.removeItem(draftKey(mode, user?.id)); } catch { /* The entry is already saved. */ }
      rememberSliders(mode, sliders, user?.id);
      toast("Saved privately.");
      setSaved(entry);
      // Starts the songs and the advice now so the panels are usually ready by
      // the time a finger arrives. Nothing here blocks the save or the toast.
      warmAftercare(entry, settings, updateEntry);

    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "This couldn't be saved just now.");
    } finally {
      setSaving(false);
    }
  };

  if (saved) {
    // The store's copy, not the one held here: the warm fetches write the songs
    // and the advice onto the entry after this page has already handed it over.
    const current = entries.find((e) => e.id === saved.id) ?? saved;
    return (
      <AppShell>
        <Aftercare entry={current} />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
      <div className="flex items-center justify-between">
        <Link to="/journal" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/12 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em]">
          <meta.icon className="h-3.5 w-3.5" style={modeGlyphStyle(mode)} aria-hidden="true" />
          {meta.label}
        </span>
      </div>

      <h1 className="page-title mt-8">
        {mode === "prompt"
          ? prompt
          : mode === "gratitude"
            ? "Three small things"
            : mode === "mood"
              ? "How are you, really?"
              : mode === "voice"
                ? "Say it out loud"
                : mode === "bullets"
                  ? "Dump it out"
                  : mode === "longform"
                    ? "Room to write"
                    : "Quick check-in"}
      </h1>
      <div className="page-underline mt-3" />

      {mode === "prompt" && (
        <button
          type="button"
          onClick={() => setPromptIndex((i) => (i + 1) % PROMPTS.length)}
          className="mt-3 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <Shuffle className="h-3.5 w-3.5" /> Different question
        </button>
      )}

      {restedDraft && <p className="mt-4 text-sm text-muted-foreground">Still here whenever</p>}

      <div className="mt-10 space-y-10">
        <CheckInSliders
          mode={mode}
          values={sliders}
          carriedOver={carried}
          onValue={(id, v) => {
            setSliders((prev) => ({ ...prev, [id]: v }));
            setCarried(false);
          }}
          feelings={feelings}
          onFeelings={setFeelings}
          showFeelings={mode !== "voice" && mode !== "gratitude"}
        />



        {mode === "longform" && (
          <div className="space-y-4">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title (optional)"
              className="h-12 rounded-xl border-0 bg-transparent px-0 font-display text-xl shadow-none focus-visible:ring-0"
            />
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Start anywhere. Sentences don't have to connect."
              className="min-h-[320px] resize-none rounded-2xl border-0 bg-card p-5 text-base leading-loose shadow-none focus-visible:ring-1 focus-visible:ring-ring/40"
            />
          </div>
        )}

        {(mode === "short" || mode === "prompt") && (
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={mode === "prompt" ? "A sentence is enough." : "One or two lines about right now."}
            className="min-h-[140px] resize-none rounded-2xl border-0 bg-card p-5 text-base leading-relaxed shadow-none focus-visible:ring-1 focus-visible:ring-ring/40"
          />
        )}

        {mode === "bullets" && (
          <div className="space-y-3">
            {bullets.map((b, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-muted-foreground">—</span>
                <Input
                  value={b}
                  autoFocus={i === bullets.length - 1 && bullets.length > 1}
                  onChange={(e) => setBullets(bullets.map((x, j) => (j === i ? e.target.value : x)))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      setBullets([...bullets, ""]);
                    }
                  }}
                  placeholder="a fragment"
                  className="h-11 rounded-xl border-0 bg-card"
                />
                {bullets.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setBullets(bullets.filter((_, j) => j !== i))}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label="Remove line"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={() => setBullets([...bullets, ""])}
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" /> Add line
            </button>
          </div>
        )}

        {mode === "gratitude" && (
          <div className="space-y-3">
            {gratitude.map((g, i) => (
              <Input
                key={i}
                value={g}
                onChange={(e) => setGratitude(gratitude.map((x, j) => (j === i ? e.target.value : x)))}
                placeholder={["something small", "someone", "something about you"][i] ?? "something"}
                className="h-12 rounded-xl border-0 bg-card"
              />
            ))}
            <p className="text-xs text-muted-foreground">One is fine.</p>
          </div>
        )}

        {mode === "voice" && (
          <VoiceRecorder
            recording={audio.recording}
            seconds={audio.seconds}
            onChange={(recording, seconds) => setAudio({ recording, seconds })}
          />
        )}
      </div>

      {saveError && <p className="mt-6 text-sm text-destructive">{saveError}</p>}
      {!user && <p className="mt-6 text-sm text-muted-foreground">Sign in to save entries.</p>}

      <div className="mt-12 flex items-center gap-4">
        <Button type="submit" disabled={!canSave || saving || !user} className="rounded-full px-7">
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save privately
        </Button>
        {hasContent ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="ghost" className="rounded-full text-muted-foreground">
                Leave without saving
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Leave without saving?</AlertDialogTitle>
                <AlertDialogDescription>What you've written here will be discarded.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep writing</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    localStorage.removeItem(draftKey(mode, user?.id));
                    navigate("/journal");
                  }}
                >
                  Leave
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          <Button asChild type="button" variant="ghost" className="rounded-full text-muted-foreground">
            <Link to="/journal">Leave without saving</Link>
          </Button>
        )}
      </div>
      </form>
    </AppShell>
  );
};

export default Compose;
