import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { GENRES } from "@/lib/content";
import { currentSettings, useSettings } from "@/lib/store";
import {
  applyTagOutcomes,
  keepOutcomesFor,
  replaceTag,
  resolveTags,
  splitTagInput,
  tagAction,
  tagNotice,
  type TagOutcome,
} from "@/lib/tags";
import { cn } from "@/lib/utils";
import Row from "./Row";
import SettingRow from "./SettingRow";

const NAME_DEBOUNCE_MS = 500;

const ProfileSection = () => {
  const { settings, update } = useSettings();
  const [open, setOpen] = useState(false);
  const [artistDraft, setArtistDraft] = useState("");
  const [nameDraft, setNameDraft] = useState(settings.name);
  const [checking, setChecking] = useState(false);
  const [notices, setNotices] = useState<TagOutcome[]>([]);

  // Follow the stored name when it changes anywhere other than this field.
  useEffect(() => {
    setNameDraft(settings.name);
  }, [settings.name]);

  // Only write the name once typing settles.
  useEffect(() => {
    if (nameDraft === settings.name) return;
    const id = window.setTimeout(() => void update({ name: nameDraft }), NAME_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [nameDraft, settings.name, update]);

  // Flush a pending edit on unmount instead of dropping it.
  const pendingRef = useRef({ nameDraft, name: settings.name, update });
  pendingRef.current = { nameDraft, name: settings.name, update };
  useEffect(() => {
    return () => {
      const { nameDraft: draft, name, update: doUpdate } = pendingRef.current;
      if (draft !== name) void doUpdate({ name: draft });
    };
  }, []);

  const toggleTaste = (g: string) =>
    update({
      musicTastes: settings.musicTastes.includes(g)
        ? settings.musicTastes.filter((x) => x !== g)
        : [...settings.musicTastes, g],
    });

  /**
   * The names go on as typed, straight away, and the spelling check catches up
   * afterwards. A check that fails, times out or is switched off leaves the
   * chips exactly as they were written, which is why nothing here waits on it.
   */
  const addArtists = async () => {
    const raw = artistDraft;
    const terms = splitTagInput(raw);
    if (!terms.length) return;
    setArtistDraft("");
    setNotices([]);

    const added = terms.filter(
      (t) => !settings.musicArtists.some((a) => a.toLowerCase() === t.toLowerCase()),
    );
    if (!added.length) return;
    setChecking(true);

    try {
      await update({ musicArtists: [...settings.musicArtists, ...added] });
      const outcomes = keepOutcomesFor(
        terms,
        added,
        // Deezer decides; the model only gets a look when Deezer finds nothing,
        // and only if they have suggestions turned on.
        await resolveTags("artist", raw, settings.aiSuggestionsEnabled),
      );
      // Read the list back rather than trusting the value this closure captured
      // before the await, since the chips above were written in between.
      await update({ musicArtists: applyTagOutcomes(currentSettings().musicArtists, added, outcomes) });
      setNotices(outcomes.filter((o) => o.status !== "kept"));
    } catch (err) {
      console.error("could not save artists", err);
    } finally {
      setChecking(false);
    }
  };

  const dismiss = (outcome: TagOutcome) => setNotices((list) => list.filter((o) => o !== outcome));

  const musicCount = settings.musicTastes.length + settings.musicArtists.length;
  const summary = [
    settings.name.trim() || "No name",
    musicCount > 0 ? `${musicCount} music ${musicCount === 1 ? "pick" : "picks"}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <>
      <SettingRow title="You" value={summary} onClick={() => setOpen(true)} />

      <Dialog open={open} onClose={() => setOpen(false)} title="You">
        <div className="-mt-3 divide-y">
          <Row
            title="Name or nickname"
            description="Only used in greetings. Leave blank if you'd rather not."
            htmlFor="settings-name"
          >
            <Input
              id="settings-name"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              placeholder="optional"
              className="h-11 w-36 rounded-xl bg-card"
            />
          </Row>
        </div>
        <p className="mt-5 text-sm font-semibold">Music you actually listen to</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {GENRES.map((g) => (
            <button
              key={g}
              onClick={() => toggleTaste(g)}
              className={cn("chip text-sm", settings.musicTastes.includes(g) && "chip-active")}
            >
              {g}
            </button>
          ))}
        </div>

        <p className="mt-6 text-sm font-semibold">Your most listened-to artists</p>

        <p className="mt-1 text-xs text-muted-foreground">
          Type a name and press enter. Song picks lean toward these when they fit the entry.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void addArtists();
          }}
          className="mt-3 flex gap-2"
        >
          <Input
            value={artistDraft}
            onChange={(e) => setArtistDraft(e.target.value)}
            placeholder="e.g. Frank Ocean"
            className="h-11 flex-1 rounded-xl bg-card"
          />
          <Button type="submit" variant="secondary" className="h-11 rounded-full px-5">
            Add
          </Button>
        </form>
        {checking && <p className="mt-2 text-xs text-muted-foreground">Checking the spelling…</p>}

        {notices.map((outcome) => {
          const action = tagAction(outcome);
          return (
            <div
              key={outcome.original}
              className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground"
            >
              <span>{tagNotice(outcome)}</span>
              {action && (
                <button
                  type="button"
                  onClick={() => {
                    void update({
                      musicArtists: replaceTag(currentSettings().musicArtists, outcome.value, action.value),
                    });
                    dismiss(outcome);
                  }}
                  className="underline underline-offset-4 hover:text-foreground"
                >
                  {action.label}
                </button>
              )}
              <button
                type="button"
                onClick={() => dismiss(outcome)}
                className="underline underline-offset-4 hover:text-foreground"
              >
                {outcome.status === "unsure" ? "No, keep mine" : "Dismiss"}
              </button>
            </div>
          );
        })}

        {settings.musicArtists.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {settings.musicArtists.map((a) => (
              <button
                key={a}
                onClick={() => update({ musicArtists: settings.musicArtists.filter((x) => x !== a) })}
                className="chip chip-active inline-flex items-center gap-2 text-sm"
                aria-label={`Remove ${a}`}
              >
                {a}
                <X className="h-3.5 w-3.5" />
              </button>
            ))}
          </div>
        )}
      </Dialog>
    </>
  );
};

export default ProfileSection;
