import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FOCUS_AREAS, GOALS, MAX_INTERESTS, YEAR_LEVELS } from "@/lib/onboarding";
import { useSettings } from "@/lib/store";
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
import type { YearLevel } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Adds or removes one id, leaving the rest of the picks alone. */
const toggle = (list: string[], id: string): string[] =>
  list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

const Question = ({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) => (
  <section className="mt-10">
    <h2 className="font-display text-xl leading-snug">{title}</h2>
    {hint && <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{hint}</p>}
    <div className="mt-4">{children}</div>
  </section>
);

const Onboarding = () => {
  const navigate = useNavigate();
  const { settings, loading, update } = useSettings();

  const [name, setName] = useState(settings.name);
  const [yearLevel, setYearLevel] = useState<YearLevel | "">(settings.yearLevel);
  const [focusAreas, setFocusAreas] = useState<string[]>(settings.focusAreas);
  const [goals, setGoals] = useState<string[]>(settings.goals);
  const [interests, setInterests] = useState<string[]>(settings.interests);
  const [interestDraft, setInterestDraft] = useState("");
  const [checking, setChecking] = useState(false);
  const [notices, setNotices] = useState<TagOutcome[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The boxes are seeded once from the profile, so nothing is rendered until
  // the profile is actually here — otherwise landing straight on this URL
  // would seed them from the empty defaults and offer to save that back.
  if (loading) return <div className="min-h-screen bg-background" />;

  /**
   * What they typed goes up as a chip straight away — "guitar/piano" as two —
   * and the spelling check catches up afterwards. If it doesn't come back, or
   * suggestions are switched off, the words stand exactly as written.
   */
  const addInterest = async () => {
    const raw = interestDraft;
    const terms = splitTagInput(raw);
    if (!terms.length) return;
    setInterestDraft("");
    setNotices([]);

    const room = Math.max(0, MAX_INTERESTS - interests.length);
    const added = terms
      .filter((t) => !interests.some((i) => i.toLowerCase() === t.toLowerCase()))
      .slice(0, room);
    if (!added.length) return;
    setInterests([...interests, ...added]);

    setChecking(true);
    const outcomes = keepOutcomesFor(
      terms,
      added,
      await resolveTags("interest", raw, settings.aiSuggestionsEnabled),
    );
    setChecking(false);
    setInterests((current) => applyTagOutcomes(current, added, outcomes));
    setNotices(outcomes.filter((o) => o.status !== "kept"));
  };

  const dismiss = (outcome: TagOutcome) => setNotices((list) => list.filter((o) => o !== outcome));

  // Skipping still stamps onboardedAt, so the questions don't come back. Every
  // answer is still reachable from Settings afterwards.
  const finish = async (keepAnswers: boolean) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await update(
        keepAnswers
          ? {
              name: name.trim(),
              yearLevel,
              focusAreas,
              goals,
              // Whatever is half-typed in the box counts as meant.
              interests: interestDraft.trim() && interests.length < MAX_INTERESTS
                ? [...interests, interestDraft.trim()]
                : interests,
              onboardedAt: new Date().toISOString(),
            }
          : { onboardedAt: new Date().toISOString() },
      );
      navigate("/journal", { replace: true });
    } catch (err) {
      console.error("could not save onboarding answers", err);
      setError("That didn't save. Try once more, or skip for now.");
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background px-5 py-16">
      <div className="mx-auto w-full max-w-md animate-rise">
        <h1 className="font-display text-3xl leading-tight">A few things, once</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          None of this is required, and all of it can change later in settings.
        </p>

        <Question title="What should we call you?" hint="Whatever you'd actually like to be called.">
          <Input
            id="preferred-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="given-name"
            maxLength={40}
            className="h-12 rounded-xl bg-card"
          />
        </Question>

        <Question title="Where are you up to at school?">
          <div className="flex flex-wrap gap-2">
            {YEAR_LEVELS.map((level) => (
              <button
                key={level.id}
                type="button"
                onClick={() => setYearLevel(yearLevel === level.id ? "" : level.id)}
                aria-pressed={yearLevel === level.id}
                className={cn("chip", yearLevel === level.id && "chip-active")}
              >
                {level.label}
              </button>
            ))}
          </div>
        </Question>

        <Question title="What's on your plate right now?" hint="Pick as many as fit, or none.">
          <div className="flex flex-wrap gap-2">
            {FOCUS_AREAS.map((area) => (
              <button
                key={area.id}
                type="button"
                onClick={() => setFocusAreas(toggle(focusAreas, area.id))}
                aria-pressed={focusAreas.includes(area.id)}
                className={cn("chip", focusAreas.includes(area.id) && "chip-active")}
              >
                {area.label}
              </button>
            ))}
          </div>
        </Question>

        <Question title="What would you like from this?">
          <div className="flex flex-wrap gap-2">
            {GOALS.map((goal) => (
              <button
                key={goal.id}
                type="button"
                onClick={() => setGoals(toggle(goals, goal.id))}
                aria-pressed={goals.includes(goal.id)}
                className={cn("chip", goals.includes(goal.id) && "chip-active")}
              >
                {goal.label}
              </button>
            ))}
          </div>
        </Question>

        <Question title="Anything you're into?" hint="Type one and press enter. Music, games, people, whatever.">
          <div className="flex items-center gap-2">
            <Input
              id="interest"
              value={interestDraft}
              onChange={(e) => setInterestDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void addInterest();
                }
              }}
              maxLength={40}
              disabled={interests.length >= MAX_INTERESTS}
              className="h-12 rounded-xl bg-card"
            />
            <Button
              type="button"
              variant="ghost"
              onClick={() => void addInterest()}
              disabled={!interestDraft.trim() || interests.length >= MAX_INTERESTS}
              className="h-12 shrink-0 rounded-xl border px-4"
            >
              Add
            </Button>
          </div>

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
                      setInterests((current) => replaceTag(current, outcome.value, action.value));
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

          {interests.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {interests.map((interest) => (
                <button
                  key={interest}
                  type="button"
                  onClick={() => setInterests(interests.filter((i) => i !== interest))}
                  aria-label={`Remove ${interest}`}
                  className="chip chip-active flex items-center gap-1.5"
                >
                  {interest}
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              ))}
            </div>
          )}
        </Question>

        {error && <p className="mt-6 text-sm text-destructive">{error}</p>}

        <Button
          type="button"
          onClick={() => void finish(true)}
          disabled={busy}
          className="mt-10 h-12 w-full rounded-full"
        >
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save and go in
        </Button>

        <button
          type="button"
          onClick={() => void finish(false)}
          disabled={busy}
          className="mt-5 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          Skip this
        </button>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Skipping won't bring this back. You can fill it in from settings whenever you want.
        </p>
      </div>
    </div>
  );
};

export default Onboarding;
