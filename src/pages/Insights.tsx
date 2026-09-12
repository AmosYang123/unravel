import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, TriangleAlert } from "lucide-react";
import AppShell from "@/components/AppShell";
import { Switch } from "@/components/ui/switch";
import { ENERGY_LABELS } from "@/lib/content";
import { supabase } from "@/integrations/supabase/client";
import {
  dayParam,
  dayPartFocus,
  energyWindows,
  isEntryStats,
  recurringFeelings,
  weekdayContrast,
  type EntryStats,
} from "@/lib/insights";
import { useSettings } from "@/lib/store";

const round1 = (value: number) => Math.round(value * 10) / 10;

const dayName = (d: number) =>
  ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d];

const energyLabel = (avg: number) =>
  ENERGY_LABELS[Math.min(Math.max(Math.round(avg), 1), ENERGY_LABELS.length) - 1];

/** Shared frame so the empty chart and the real one read the same way. */
const ChartFrame = ({ children }: { children: React.ReactNode }) => (
  <div className="mt-6 flex gap-2.5">
    <div className="relative h-32 w-3 shrink-0">
      {[1, 3, 5].map((v) => (
        <span
          key={v}
          className="absolute right-0 translate-y-1/2 text-[0.6rem] font-semibold text-muted-foreground/70 tabular-nums"
          style={{ bottom: `${(v / 5) * 100}%` }}
        >
          {v}
        </span>
      ))}
    </div>
    <div className="relative h-32 flex-1">
      {[1, 2, 3, 4, 5].map((v) => (
        <span
          key={v}
          className="pointer-events-none absolute inset-x-0 border-t border-dashed border-border/60"
          style={{ bottom: `${(v / 5) * 100}%` }}
        />
      ))}
      <div className="relative flex h-full items-end gap-1.5 sm:gap-2">{children}</div>
    </div>
  </div>
);

const Insights = () => {
  const { settings, update } = useSettings();
  const [entryStats, setEntryStats] = useState<EntryStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!settings.insightsEnabled) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    (async () => {
      try {
        const { data, error } = await supabase.rpc("entry_stats");
        if (cancelled) return;
        if (error || !isEntryStats(data)) {
          setLoadError(true);
        } else {
          setEntryStats(data);
        }
      } catch {
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [settings.insightsEnabled]);

  const stats = useMemo(() => {
    if (!entryStats) return null;
    return {
      energy: energyWindows(entryStats),
      feelings: recurringFeelings(entryStats.feelings),
      weekday: weekdayContrast(entryStats.weekday),
      dayPart: dayPartFocus(entryStats.dayParts),
      recent: entryStats.recent.slice().reverse(),
    };
  }, [entryStats]);

  return (
    <AppShell>
      <header className="animate-fade">
        <h1 className="page-title">Patterns</h1>
        <div className="page-underline mt-3" />
        <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
          Calculated on this device, only from moods and tags you chose.{" "}
          <span className="mark">Your writing is never analyzed.</span>
        </p>
      </header>

      <div className="surface mt-8 flex items-center justify-between gap-4 p-5">
        <div className="min-w-0">
          <p className="text-base font-semibold">Show patterns</p>
          <p className="mt-1 text-sm text-muted-foreground">Turn off if you'd rather not see any of this.</p>
        </div>
        <Switch
          checked={settings.insightsEnabled}
          onCheckedChange={(v) => update({ insightsEnabled: v })}
          aria-label="Show patterns"
        />
      </div>

      {!settings.insightsEnabled ? (
        <p className="mt-10 text-sm text-muted-foreground">Patterns are off. Your entries are still saved.</p>
      ) : loading ? (
        <p className="mt-10 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Reading your patterns…
        </p>
      ) : loadError ? (
        <p className="mt-10 flex items-center gap-2 text-sm text-muted-foreground">
          <TriangleAlert className="h-3.5 w-3.5" /> Your patterns didn't load. Try refreshing the page.
        </p>
      ) : !stats || !stats.energy ? (
        <div className="mt-10">
          <section className="surface p-5 sm:p-6">
            <h2 className="section-label">Recent energy</h2>
            <div className="mt-5 flex items-baseline gap-2">
              <span className="font-display text-4xl font-bold leading-none text-muted-foreground/40">—</span>
              <span className="text-sm text-muted-foreground">/ 5 lately</span>
            </div>
            <ChartFrame>
              {Array.from({ length: 14 }, (_, i) => (
                <span
                  key={i}
                  className="flex-1 rounded-t-md border border-dashed border-border/70 bg-transparent"
                  style={{ height: `${[40, 60, 40, 80, 60, 60, 100, 40, 60, 80, 60, 40, 80, 60][i]}%` }}
                />
              ))}
            </ChartFrame>
            <div className="hairline mt-2" />
            <div className="eyebrow mt-2 flex justify-between">
              <span>Low energy</span>
              <span>High energy</span>
            </div>
          </section>
          <p className="mt-6 max-w-md text-sm leading-relaxed text-muted-foreground">
            One bar per check-in, tallest when your energy ran high. About a week of entries and the shape
            starts to be worth looking at — the rest of this page fills in behind it.{" "}
            <Link to="/journal" className="underline underline-offset-4">
              Check in
            </Link>
            .
          </p>
        </div>
      ) : (
        <div className="mt-10 space-y-10">
          <section className="surface p-5 sm:p-6">
            <h2 className="section-label">Recent energy</h2>
            <div className="mt-5 flex items-baseline gap-2">
              <span className="font-display text-4xl font-bold leading-none text-foreground">
                {round1(stats.energy.recent.avg)}
              </span>
              <span className="text-sm text-muted-foreground">/ 5 lately</span>
              <span className="ml-auto shrink-0 whitespace-nowrap rounded-full border border-accent/50 bg-accent/12 px-3 py-1 text-xs font-semibold">
                {energyLabel(stats.energy.recent.avg)}
              </span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {stats.energy.earlier ? (
                <>
                  Against <span className="mark">{round1(stats.energy.earlier.avg)}</span> across your first
                  month — {stats.energy.earlier.n} entries then, {stats.energy.recent.n} in the last thirty
                  days.
                </>
              ) : (
                <>
                  From your most recent thirty days, {stats.energy.recent.n}{" "}
                  {stats.energy.recent.n === 1 ? "entry" : "entries"}. Not enough history yet to set it
                  against where you started.
                </>
              )}
            </p>
            <ChartFrame>
              {stats.recent.map((e) => (
                <Link
                  key={e.id}
                  to={`/history?on=${dayParam(e.createdAt)}`}
                  title={`${new Date(e.createdAt).toLocaleDateString(undefined, {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                  })} · ${ENERGY_LABELS[e.energy - 1]}`}
                  aria-label={`${new Date(e.createdAt).toLocaleDateString(undefined, {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                  })}, ${ENERGY_LABELS[e.energy - 1]} — open in the Timeline`}
                  className="bar-fill min-h-[6px] flex-1 rounded-t-md transition-all duration-500 hover:brightness-110"
                  style={{ height: `${(e.energy / 5) * 100}%` }}
                />
              ))}
            </ChartFrame>
            <div className="hairline mt-2" />
            <div className="eyebrow mt-2 flex justify-between">
              <span>Low energy</span>
              <span>High energy</span>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">Tap a bar to read that day.</p>
          </section>

          {stats.feelings.length > 0 && (
            <section>
              <h2 className="section-label">Recurring words</h2>
              <ul className="mt-4 space-y-2.5">
                {stats.feelings.map(({ feeling, n }) => (
                  <li key={feeling}>
                    <Link
                      to={`/history?feeling=${encodeURIComponent(feeling)}`}
                      className="flex items-center gap-3 rounded-xl py-1 text-sm transition-opacity hover:opacity-70"
                      aria-label={`${feeling}, ${n} entries — open in the Timeline`}
                    >
                      <span className="w-24 shrink-0 truncate font-medium sm:w-28">{feeling}</span>
                      <span className="flex-1">
                        <span
                          className="bar-fill-h block h-2 min-w-[6px] rounded-full"
                          style={{ width: `${(n / stats.feelings[0].n) * 100}%` }}
                        />
                      </span>
                      <span className="w-6 shrink-0 text-right text-xs font-semibold text-muted-foreground tabular-nums">
                        {n}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted-foreground">Tap a word to see those entries.</p>
            </section>
          )}

          {stats.dayPart && (
            <section>
              <h2 className="section-label">When you write</h2>
              <p className="mt-4 text-base leading-relaxed">
                {stats.dayPart.dominant && (
                  <>
                    Most of your entries land in{" "}
                    <span className="mark">{stats.dayPart.dominant.label}</span> — across{" "}
                    {stats.dayPart.dominant.n} of them.{" "}
                  </>
                )}
                {stats.dayPart.high && stats.dayPart.low && (
                  <>
                    {stats.dayPart.dominant?.id === stats.dayPart.high.id ? (
                      <>
                        Mood there runs higher than in {stats.dayPart.low.label} —{" "}
                        {round1(stats.dayPart.high.mood)} against {round1(stats.dayPart.low.mood)}, across{" "}
                        {stats.dayPart.low.n} entries.
                      </>
                    ) : (
                      <>
                        Mood runs higher in <span className="mark">{stats.dayPart.high.label}</span>,{" "}
                        {round1(stats.dayPart.high.mood)} across {stats.dayPart.high.n} entries, than in{" "}
                        {stats.dayPart.low.label}, {round1(stats.dayPart.low.mood)} across{" "}
                        {stats.dayPart.low.n}.
                      </>
                    )}{" "}
                    Might be the hour, might just be what happened those days.
                  </>
                )}
              </p>
            </section>
          )}

          {stats.weekday && (
            <section>
              <h2 className="section-label">One thing to notice</h2>
              <p className="mt-4 text-base leading-relaxed">
                Your energy tends to run lowest on <span className="mark">{dayName(stats.weekday.low.day)}s</span>
                , across {stats.weekday.low.n} of them, and highest on{" "}
                <span className="mark">{dayName(stats.weekday.high.day)}s</span>, across{" "}
                {stats.weekday.high.n}. That's a pattern, not a rule.
              </p>
            </section>
          )}
        </div>
      )}
    </AppShell>
  );
};

export default Insights;
