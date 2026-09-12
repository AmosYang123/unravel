import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Music, Wind, Compass, Check, Shuffle, RefreshCw, Loader2, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import BreathingSession from "@/components/BreathingSession";
import { entryText, supportPlan, type SupportPlan } from "@/lib/content";
import { fetchEntryAdvice } from "@/lib/advice";
import { fetchSongSuggestions, type SongSuggestions } from "@/lib/music";
import type { Entry, Settings } from "@/lib/types";
import { useEntries, useSettings } from "@/lib/store";
import { cn } from "@/lib/utils";

type Panel = "music" | "breathe" | "plan" | null;
type PanelKey = Exclude<Panel, null>;

/** One request a panel is waiting on. `warm` means a save-time request may already cover it. */
interface Ask {
  seed: number;
  warm?: boolean;
}

type Persist = (id: string, patch: Partial<Entry>) => Promise<void>;

const newSongSeed = () => Math.floor(Math.random() * 997);

/**
 * Save-time requests, kept by entry id so a panel opened seconds later waits on
 * the answer already coming instead of asking for a different one. A request
 * that fails is dropped, which leaves the panel free to try for itself.
 */
const warmSongs = new Map<string, Promise<SongSuggestions>>();
const warmPlans = new Map<string, Promise<SupportPlan>>();

/** Writing the aftercare back is best effort; the panel still shows what came back. */
const keepOnEntry = (persist: Persist, id: string, patch: Partial<Entry>) => {
  void persist(id, patch).catch((err: unknown) => {
    console.error("Couldn't store the aftercare on this entry:", err);
  });
};

/**
 * Starts the song and advice requests the moment an entry is saved and writes
 * what comes back onto the entry. Failures stay quiet here — the panels keep
 * their own loading and error states for whoever opens them.
 *
 * Nothing at all happens when suggestions are off: the gate lives here rather
 * than at the call site so no caller can forget it.
 */
export function warmAftercare(entry: Entry, settings: Settings, persist: Persist) {
  if (!settings.aiSuggestionsEnabled) return;

  if (!warmSongs.has(entry.id)) {
    const songs = fetchSongSuggestions(entry, settings, newSongSeed()).then((res) => {
      keepOnEntry(persist, entry.id, { songs: res });
      return res;
    });
    songs.catch(() => warmSongs.delete(entry.id));
    warmSongs.set(entry.id, songs);
  }

  if (!warmPlans.has(entry.id)) {
    const plan = fetchEntryAdvice(entry, 0, (result) =>
      keepOnEntry(persist, entry.id, {
        transcript: result.transcript,
        transcriptSummary: result.summary ?? undefined,
        transcriptStatus: "done",
      }),
    ).then((p) => {
      keepOnEntry(persist, entry.id, { advice: p });
      return p;
    });
    plan.catch(() => warmPlans.delete(entry.id));
    warmPlans.set(entry.id, plan);
  }
}

/** Shown in place of anything fetched, so the setting's effect is never a mystery. */
const SuggestionsOff = () => (
  <p className="text-sm leading-relaxed text-muted-foreground">
    Suggestions are off, so nothing about this entry was sent anywhere. Turn them back on in{" "}
    <Link to="/settings" className="underline underline-offset-4">
      Settings
    </Link>
    .
  </p>
);

const OPTIONS: Record<PanelKey, { label: string; icon: LucideIcon }> = {
  music: { label: "Song options", icon: Music },
  breathe: { label: "Meditation", icon: Wind },
  plan: { label: "AI advice & encouragement", icon: Compass },
};

/** Barely a paragraph, and a real sit-down. */
const SHORT_ENTRY = 140;
const LONG_ENTRY = 600;

/** Which door the entry itself asks for. Nothing on screen explains the order. */
const orderByEntry = (entry: Entry): PanelKey[] => {
  const written = entryText(entry).trim().length;
  const flat = entry.mood === 3 && entry.feelings.length === 0;
  if (written < SHORT_ENTRY && flat) return ["breathe", "plan", "music"];
  if (written > LONG_ENTRY || entry.mood <= 2) return ["plan", "music", "breathe"];
  if (entry.mood >= 4) return ["music", "plan", "breathe"];
  return ["music", "breathe", "plan"];
};

/**
 * What each onboarding goal asks to be offered first (ids from GOALS in
 * lib/onboarding.ts). "keep a record" is absent on purpose: it says nothing
 * about aftercare, so it leaves the entry's own order alone. The list is
 * ordered, so someone who picked two goals gets a settled answer rather than
 * whichever happened to be stored first.
 */
const GOAL_PANEL: { goal: string; panel: PanelKey }[] = [
  { goal: "calm", panel: "breathe" },
  { goal: "patterns", panel: "plan" },
  { goal: "vent", panel: "music" },
];

/** The entry's own order, with a stated goal's door pulled to the front of it. */
const orderPanels = (entry: Entry, goals: string[]): PanelKey[] => {
  const order = orderByEntry(entry);
  const wanted = GOAL_PANEL.find((g) => goals.includes(g.goal))?.panel;
  return wanted ? [wanted, ...order.filter((key) => key !== wanted)] : order;
};

const Aftercare = ({ entry, revisit }: { entry: Entry; revisit?: boolean }) => {
  const { settings } = useSettings();
  const { updateEntry } = useEntries();

  const [panel, setPanel] = useState<Panel>(null);
  // Both the songs and the advice describe this entry to a service, so both wait
  // on the same permission. Stored aftercare still shows: it is already here.
  const suggestionsOn = settings.aiSuggestionsEnabled;
  // Fixed when the aftercare opens, so the buttons never rearrange under a
  // finger as a transcript or a plan lands.
  const [options] = useState(() => orderPanels(entry, settings.goals).map((key) => ({ key, ...OPTIONS[key] })));

  const [songAsk, setSongAsk] = useState<Ask | null>(null);
  const [songs, setSongs] = useState<SongSuggestions | null>(null);
  const [songsLoading, setSongsLoading] = useState(false);
  const [songsError, setSongsError] = useState<string | null>(null);
  // What this entry was already given stands until a fetch here replaces it.
  const shownSongs = songs ?? entry.songs ?? null;

  const [planAsk, setPlanAsk] = useState<Ask | null>(null);
  const [plan, setPlan] = useState<SupportPlan | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const shownPlan = plan ?? entry.advice ?? null;

  const entryRef = useRef(entry);

  useEffect(() => {
    entryRef.current = entry;
  }, [entry]);

  const needsTranscript = entry.mode === "voice" && !entry.transcript && !!entry.audioPath;

  useEffect(() => {
    if (!songAsk || !settings.aiSuggestionsEnabled) return;
    let cancelled = false;
    const target = entryRef.current;
    setSongsLoading(true);
    setSongsError(null);
    const pending = songAsk.warm ? warmSongs.get(target.id) : undefined;
    const request =
      pending ??
      fetchSongSuggestions(target, settings, songAsk.seed).then((res) => {
        keepOnEntry(updateEntry, target.id, { songs: res });
        return res;
      });

    request
      .then((res) => {
        if (!cancelled) setSongs(res);
      })
      .catch((err: unknown) => {
        console.error("fetchSongSuggestions failed:", err);
        if (!cancelled) setSongsError("Couldn't find songs just now.");
      })
      .finally(() => {
        if (!cancelled) setSongsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [songAsk]);

  useEffect(() => {
    if (!planAsk || !settings.aiSuggestionsEnabled) return;
    let cancelled = false;
    const target = entryRef.current;
    setPlanLoading(true);
    setPlanError(null);
    const pending = planAsk.warm ? warmPlans.get(target.id) : undefined;
    const request =
      pending ??
      fetchEntryAdvice(target, planAsk.seed, (result) =>
        keepOnEntry(updateEntry, target.id, {
          transcript: result.transcript,
          transcriptSummary: result.summary ?? undefined,
          transcriptStatus: "done",
        }),
      ).then((p) => {
        keepOnEntry(updateEntry, target.id, { advice: p });
        return p;
      });

    request
      .then((p) => {
        if (!cancelled) setPlan(p);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error("fetchEntryAdvice failed:", err);
        setPlanError("Couldn't reach the advice service just now.");
        const local = supportPlan(target, planAsk.seed);
        const offline = { ...local, basis: `Written on-device from this entry (${local.basis})` };
        setPlan(offline);
        // Kept too: what you were given has to be what you find later.
        keepOnEntry(updateEntry, target.id, { advice: offline });
      })
      .finally(() => {
        if (!cancelled) setPlanLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [planAsk]);

  const openPanel = (key: PanelKey) => {
    const next = panel === key ? null : key;
    setPanel(next);
    // Only ask for what this entry hasn't already been given, and only if asking is allowed.
    if (!suggestionsOn) return;
    if (next === "music" && !shownSongs && !songAsk) setSongAsk({ seed: newSongSeed(), warm: true });
    if (next === "plan" && !shownPlan && !planAsk) setPlanAsk({ seed: 0, warm: true });
  };


  return (
    <div className="animate-rise">
      {!revisit && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Check className="h-4 w-4" /> Saved, privately.
        </div>
      )}
      <h1 className="mt-4 font-display text-3xl leading-tight">{revisit ? "Anything for this entry?" : "What would help right now?"}</h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
        All optional. The check-in already counted.
      </p>

      <div className="mt-8 space-y-3">
        {options.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => openPanel(key)}
            className={cn(
              "flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition-colors",
              panel === key ? "border-accent bg-accent/10" : "hover:border-foreground/25",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
            <span className="min-w-0">{label}</span>
          </button>
        ))}
      </div>

      {panel === "music" && (
        <div className="surface mt-6 p-5">
          {suggestionsOn ? (
            <p className="text-sm text-muted-foreground">
              {settings.musicArtists.length || settings.musicTastes.length
                ? `Pulled live from your taste — ${[...settings.musicTastes, ...settings.musicArtists].slice(0, 4).join(", ")}${[...settings.musicTastes, ...settings.musicArtists].length > 4 ? "…" : ""} — and matched to this entry.`
                : "Pulled live and matched to this entry."}
            </p>
          ) : (
            <SuggestionsOff />
          )}

          {songsLoading && !shownSongs && (
            <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Looking for something that fits…
            </p>
          )}

          {songsError && !songsLoading && !shownSongs && (
            <div className="mt-4">
              <p className="text-sm text-muted-foreground">{songsError}</p>
              <button
                onClick={() => setSongAsk((a) => ({ seed: (a?.seed ?? newSongSeed()) + 1 }))}
                className="mt-2 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Try again
              </button>
            </div>
          )}

          {shownSongs && (
            <>
              <ul className="mt-4 divide-y">
                {shownSongs.picks.map((song) => (
                  <li key={song.id} className="flex gap-4 py-3">
                    {song.albumArt && (
                      <img
                        src={song.albumArt}
                        alt={`Album art for ${song.title} by ${song.artist}`}
                        loading="lazy"
                        className="h-14 w-14 shrink-0 rounded-lg object-cover"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="font-display text-lg">
                        {song.url ? (
                          <a
                            href={song.url}
                            target="_blank"
                            rel="noreferrer"
                            className="underline-offset-4 hover:underline"
                          >
                            {song.title}
                          </a>
                        ) : (
                          song.title
                        )}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {song.artist}
                        {song.genre ? ` · ${song.genre}` : ""}
                      </p>
                      {song.note && <p className="mt-1 text-sm">{song.note}</p>}
                      <p className="mt-1 text-xs text-muted-foreground">Why this: {song.reason}</p>
                      {song.previewUrl && (
                        <audio controls src={song.previewUrl} className="mt-2 h-8 w-full max-w-[240px]" />
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted-foreground">
                {shownSongs.source === "deezer"
                  ? `From Deezer · ${shownSongs.basis}`
                  : "Live picks couldn't answer just now, so these come from the built-in list."}
              </p>
            </>
          )}

          {suggestionsOn && (
            <div className="mt-4 flex items-center gap-4">
              <button
                onClick={() => setSongAsk((a) => ({ seed: (a?.seed ?? newSongSeed()) + 3 }))}
                disabled={songsLoading}
                className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                <Shuffle className="h-3.5 w-3.5" /> Different songs
              </button>
              {settings.musicArtists.length === 0 && (
                <Link to="/settings" className="text-sm underline underline-offset-4">
                  Add your most-listened artists
                </Link>
              )}
            </div>
          )}
        </div>
      )}

      {panel === "breathe" && (
        <div className="surface mt-6 p-5">
          <BreathingSession />
        </div>
      )}

      {panel === "plan" && (
        <div className="surface mt-6 p-5">
          {!suggestionsOn && (
            <div className={cn(shownPlan && "mb-4")}>
              <SuggestionsOff />
            </div>
          )}

          {planLoading && !shownPlan && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {needsTranscript ? "Listening to your memo, then reading it…" : "Reading your entry…"}
            </p>
          )}


          {planError && (
            <p className="mb-4 text-sm text-muted-foreground">
              {planError} Here's something written on-device instead.
            </p>
          )}

          {shownPlan && (
            <div className={cn(planLoading && "opacity-50 transition-opacity")}>
              <p className="font-display text-xl">{shownPlan.headline}</p>
              <p className="mt-3 text-sm leading-relaxed">{shownPlan.encouragement}</p>
              <ol className="mt-5 space-y-3">
                {shownPlan.steps.map((step, i) => (
                  <li key={i} className="flex gap-3 text-sm leading-relaxed">
                    <span className="text-muted-foreground">{i + 1}.</span>
                    {step}
                  </li>
                ))}
              </ol>
              {suggestionsOn && (
                <button
                  onClick={() => setPlanAsk((a) => ({ seed: (a?.seed ?? 0) + 1 }))}
                  disabled={planLoading}
                  className="mt-5 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", planLoading && "animate-spin")} /> Different advice
                </button>
              )}
              <p className="mt-4 text-xs text-muted-foreground">
                {shownPlan.basis}. What's sent is this entry itself — mood, energy, feelings, prompt, pre-writing
                answers, and its text or voice recording — never your name or anything else you've written. Turn this
                off any time in Settings.
              </p>
            </div>
          )}
        </div>
      )}


      <div className="mt-10 flex flex-wrap gap-3">
        <Button asChild className="rounded-full px-6">
          <Link to="/journal">Nothing, I'm done</Link>
        </Button>
        <Button asChild variant="ghost" className="rounded-full">
          <Link to={`/entry/${entry.id}`}>See the entry</Link>
        </Button>
      </div>
    </div>
  );
};

export default Aftercare;
