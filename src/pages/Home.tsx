import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Lock } from "lucide-react";
import logoMark from "@/assets/logo-unravel.png";
import AppShell from "@/components/AppShell";

import { entryPreview, modeGlyphStyle, MODE_META } from "@/lib/content";
import { draftAge, draftHasContent, loadDraft } from "@/lib/drafts";
import type { EntryMode } from "@/lib/types";
import { useEntries, useSettings } from "@/lib/store";
import { cn } from "@/lib/utils";

const WAYS: EntryMode[] = ["longform", "voice", "bullets", "mood", "prompt", "short"];
const MORE: EntryMode[] = ["gratitude"];

const GAP_MS = 14 * 24 * 60 * 60 * 1000;

/** Modes with something half-written waiting, most recently touched first. */
const waitingDrafts = (userId: string | null): EntryMode[] =>
  [...WAYS, ...MORE]
    .map((mode) => ({ mode, draft: loadDraft(mode, userId) }))
    .filter(({ draft }) => draft && draftHasContent(draft))
    // A draft from before timestamps existed has no age, so it sorts last.
    .map(({ mode, draft }) => ({ mode, age: (draft && draftAge(draft)) ?? Number.MAX_SAFE_INTEGER }))
    .sort((a, b) => a.age - b.age)
    .map(({ mode }) => mode);

const greeting = () => {
  const h = new Date().getHours();
  if (h < 5) return "Still up";
  if (h < 12) return "Morning";
  if (h < 17) return "Afternoon";
  if (h < 22) return "Evening";
  return "Late tonight";
};

const Home = () => {
  const { settings } = useSettings();
  const { entries, entryCount, userId } = useEntries();
  const navigate = useNavigate();
  const recent = entries.slice(0, 3);

  // Read once per visit: drafts only change from the compose screen.
  const [drafts] = useState(() => waitingDrafts(userId));
  const waiting = drafts[0];
  const newest = entries[0];
  const beenAWhile = !!newest && Date.now() - new Date(newest.createdAt).getTime() > GAP_MS;

  return (
    <AppShell>
      <header className="animate-fade">
        <div className="flex items-start gap-3.5">
          <div
            role="img"
            aria-label="Unravel logo: a ball of yarn with one thread unraveling"
            className="mt-0.5 h-11 w-auto shrink-0 bg-primary sm:h-14"
            style={{
              aspectRatio: "459 / 651",
              WebkitMaskImage: `url(${logoMark})`,
              maskImage: `url(${logoMark})`,
              WebkitMaskSize: "contain",
              maskSize: "contain",
              WebkitMaskRepeat: "no-repeat",
              maskRepeat: "no-repeat",
              WebkitMaskPosition: "center",
              maskPosition: "center",
            }}
          />

          <p className="text-gradient mt-1 font-display text-3xl font-bold leading-none tracking-tight sm:text-4xl">
            Unravel
          </p>

        </div>

        

        <p className="mt-6 text-sm text-muted-foreground">
          {greeting()}
          {settings.name ? `, ${settings.name}` : ""}
        </p>
        <h1 className="page-title mt-2">
          How do you want to check in?
        </h1>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
          <span className="mark">Thirty seconds is a real check-in.</span> So is thirty minutes. Nothing here
          counts days or keeps score.
        </p>

        {beenAWhile && (
          <p className="mt-4 text-sm text-muted-foreground">Been a while. Nothing's changed here.</p>
        )}

        {waiting && (
          <button
            onClick={() => navigate(`/write?mode=${waiting}`)}
            className="mt-4 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            You left something in {MODE_META[waiting].label}
          </button>
        )}

      </header>

      <section className="mt-10 grid gap-3 animate-rise sm:grid-cols-2">
        {WAYS.map((mode) => {
          const meta = MODE_META[mode];
          return (
            <button
              key={mode}
              onClick={() => navigate(`/write?mode=${mode}`)}
              className="surface surface-hover group flex w-full items-center justify-between gap-4 p-5 text-left hover:-translate-y-0.5"
            >
              <span className="min-w-0">
                <span className="flex items-center gap-2 font-display text-xl font-semibold">
                  <meta.icon className="h-4 w-4 shrink-0" style={modeGlyphStyle(mode)} aria-hidden="true" />
                  {meta.label}
                  {drafts.includes(mode) && (
                    <span
                      role="img"
                      aria-label="unfinished"
                      className="ml-2 inline-block h-1.5 w-1.5 rounded-full bg-accent/70 align-middle"
                    />
                  )}
                </span>
                <span className="mt-1 block text-sm text-muted-foreground">{meta.blurb}</span>
              </span>
              <span className="whitespace-nowrap rounded-full border border-border/70 bg-gradient-to-b from-secondary to-muted px-3 py-1 text-xs font-medium text-secondary-foreground">
                {meta.minutes}
              </span>
            </button>
          );
        })}
      </section>

      <section className="mt-8">
        <h2 className="section-label">Something softer</h2>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {MORE.map((mode) => {
            const meta = MODE_META[mode];
            return (
              <button
                key={mode}
                onClick={() => navigate(`/write?mode=${mode}`)}
                className={cn(
                  "surface-hover rounded-2xl border border-border/70 bg-gradient-to-br from-secondary/80 via-muted/60 to-card/40 p-4 text-left",
                  MORE.length === 1 && "col-span-2",
                )}
              >
                <span className="flex items-center gap-2 text-base font-medium">
                  <meta.icon className="h-4 w-4 shrink-0" style={modeGlyphStyle(mode)} aria-hidden="true" />
                  {meta.label}
                  {drafts.includes(mode) && (
                    <span
                      role="img"
                      aria-label="unfinished"
                      className="ml-2 inline-block h-1.5 w-1.5 rounded-full bg-accent/70 align-middle"
                    />
                  )}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">{meta.minutes}</span>
              </button>
            );
          })}
        </div>
      </section>


      <section className="mt-8 grid grid-cols-2 gap-3">
        <Link
          to="/breathe"
          className="surface-hover rounded-2xl border border-border/70 bg-gradient-to-br from-secondary/80 via-muted/60 to-card/40 p-4"
        >
          <span className="block text-base font-medium">Just breathe</span>
          <span className="mt-1 block text-xs text-muted-foreground">No entry needed</span>
        </Link>
        <Link
          to="/history"
          className="surface-hover rounded-2xl border border-border/70 bg-gradient-to-br from-secondary/80 via-muted/60 to-card/40 p-4"
        >
          <span className="block text-base font-medium">Read something old</span>
          <span className="mt-1 block text-xs text-muted-foreground">{entryCount} saved</span>
        </Link>
      </section>

      {recent.length > 0 && (
        <section className="mt-12">
          <h2 className="section-label">Recent</h2>

          <ul className="mt-4 divide-y">
            {recent.map((entry) => (
              <li key={entry.id}>
                <Link to={`/entry/${entry.id}`} className="block py-4 transition-opacity hover:opacity-70">
                  <p className="text-xs text-muted-foreground">
                    {new Date(entry.createdAt).toLocaleDateString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                  <p className="mt-1 line-clamp-2 text-sm leading-relaxed">{entryPreview(entry)}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-14 flex items-center gap-2 text-xs text-muted-foreground">
        <Lock className="h-3 w-3" /> Saved to your account only. Nobody else can read it.
      </p>
    </AppShell>
  );
};

export default Home;
