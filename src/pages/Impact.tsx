import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Lock, TriangleAlert } from "lucide-react";
import AppShell from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";

type Overview = {
  total_entries: number;
  total_people: number;
  avg_mood: number | null;
  avg_energy: number | null;
  breathed_entries: number;
};

type Weekly = {
  week: string;
  entries: number;
  people: number;
  avg_mood: number | null;
  avg_energy: number | null;
};

type Trajectory = {
  person_code: string;
  entries: number;
  first_entry_at: string;
  last_entry_at: string;
  early_avg_mood: number | null;
  recent_avg_mood: number | null;
  early_avg_energy: number | null;
  recent_avg_energy: number | null;
};

const num = (v: number | null | undefined) => (v == null ? "—" : Number(v).toFixed(1));

const isOverviewRow = (v: unknown): v is Overview =>
  typeof v === "object" && v !== null && "total_entries" in v && "total_people" in v;

const isWeeklyRow = (v: unknown): v is Weekly =>
  typeof v === "object" && v !== null && "week" in v && "entries" in v;

const isTrajectoryRow = (v: unknown): v is Trajectory =>
  typeof v === "object" && v !== null && "person_code" in v && "entries" in v;

const delta = (early: number | null, recent: number | null) => {
  if (early == null || recent == null) return null;
  return Number(recent) - Number(early);
};

const Impact = () => {
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [weekly, setWeekly] = useState<Weekly[]>([]);
  const [trajectory, setTrajectory] = useState<Trajectory[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [o, w, t] = await Promise.all([
          supabase.rpc("wellness_metrics_overview"),
          supabase.rpc("wellness_metrics_weekly"),
          supabase.rpc("wellness_metrics_trajectory"),
        ]);
        if (cancelled) return;
        if (o.error || w.error || t.error) {
          setDenied(true);
        } else {
          const overviewRows = Array.isArray(o.data) ? o.data.filter(isOverviewRow) : [];
          const weeklyRows = Array.isArray(w.data) ? w.data.filter(isWeeklyRow) : [];
          const trajectoryRows = Array.isArray(t.data) ? t.data.filter(isTrajectoryRow) : [];
          setOverview(overviewRows[0] ?? null);
          setWeekly(weeklyRows);
          setTrajectory(trajectoryRows);
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
  }, []);

  const maxEntries = Math.max(1, ...weekly.map((w) => w.entries));

  return (
    <AppShell>
      <h1 className="text-3xl">Impact</h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
        Aggregate mood and energy only. No entry text, voice memos, names, or emails are ever readable here — not even
        for you.
      </p>

      {loading && (
        <p className="mt-10 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Reading the numbers…
        </p>
      )}

      {!loading && denied && (
        <p className="mt-10 flex items-center gap-2 text-sm text-muted-foreground">
          <Lock className="h-3.5 w-3.5" /> This page is limited to the app owner.{" "}
          <Link to="/journal" className="underline underline-offset-4">
            Back home
          </Link>
        </p>
      )}

      {!loading && loadError && (
        <p className="mt-10 flex items-center gap-2 text-sm text-muted-foreground">
          <TriangleAlert className="h-3.5 w-3.5" /> The numbers didn't load. Try refreshing the page.
        </p>
      )}

      {!loading && !denied && !loadError && (
        <div className="mt-10 space-y-12">
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Check-ins", value: overview?.total_entries ?? 0 },
              { label: "People", value: overview?.total_people ?? 0 },
              { label: "Avg mood", value: num(overview?.avg_mood) },
              { label: "Avg energy", value: num(overview?.avg_energy) },
            ].map((s) => (
              <div key={s.label} className="surface p-4">
                <p className="font-display text-2xl">{s.value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </section>

          <section>
            <h2 className="section-label">Week by week</h2>
            {weekly.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">Nothing recorded yet.</p>
            ) : (
              <ul className="mt-4 divide-y">
                {weekly.map((w) => (
                  <li key={w.week} className="flex items-center gap-4 py-3 text-sm">
                    <span className="w-24 shrink-0 text-muted-foreground">
                      {/* w.week is a date-only string (YYYY-MM-DD); parse as local so the
                          label doesn't shift a day at negative UTC offsets. */}
                      {(() => {
                        const [y, m, d] = w.week.split("-").map(Number);
                        return new Date(y, m - 1, d).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        });
                      })()}
                    </span>
                    <span
                      className="h-1.5 min-w-[4px] rounded-full bg-accent/50"
                      style={{ width: `${(w.entries / maxEntries) * 45}%` }}
                    />
                    <span className="ml-auto whitespace-nowrap text-xs text-muted-foreground">
                      {w.entries} check-ins · mood {num(w.avg_mood)} · energy {num(w.avg_energy)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="eyebrow">
              First entries vs. most recent
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Each row is one anonymous person, shown only as a code. Averages compare their first three check-ins to
              their last three.
            </p>
            {trajectory.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">Nothing recorded yet.</p>
            ) : (
              <ul className="mt-4 divide-y">
                {trajectory.map((t) => {
                  const dMood = delta(t.early_avg_mood, t.recent_avg_mood);
                  const dEnergy = delta(t.early_avg_energy, t.recent_avg_energy);
                  return (
                    <li key={t.person_code} className="py-4 text-sm">
                      <p className="font-mono text-xs text-muted-foreground">{t.person_code}</p>
                      <p className="mt-1">
                        Mood {num(t.early_avg_mood)} → {num(t.recent_avg_mood)}
                        {dMood != null && (
                          <span className="text-muted-foreground">
                            {" "}
                            ({dMood >= 0 ? "+" : ""}
                            {dMood.toFixed(1)})
                          </span>
                        )}
                        {" · "}
                        Energy {num(t.early_avg_energy)} → {num(t.recent_avg_energy)}
                        {dEnergy != null && (
                          <span className="text-muted-foreground">
                            {" "}
                            ({dEnergy >= 0 ? "+" : ""}
                            {dEnergy.toFixed(1)})
                          </span>
                        )}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t.entries} check-ins ·{" "}
                        {new Date(t.first_entry_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })} –{" "}
                        {new Date(t.last_entry_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}
    </AppShell>
  );
};

export default Impact;
