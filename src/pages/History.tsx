import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Search, X } from "lucide-react";
import AppShell from "@/components/AppShell";
import { Input } from "@/components/ui/input";
import { entryPreview, MODE_META, modeGlyphStyle, MOOD_LABELS } from "@/lib/content";
import { supabase } from "@/integrations/supabase/client";
import { isEntryStats } from "@/lib/insights";
import { queryEntries, useEntries, type EntryFilters } from "@/lib/store";
import type { Entry, EntryMode } from "@/lib/types";
import { cn } from "@/lib/utils";

const MOOD_TONES = ["bg-accent/70", "bg-accent/55", "bg-accent/40", "bg-accent/25", "bg-accent/15"];
const clampMood = (mood: number) => Math.min(Math.max(mood, 1), 5);
const moodTone = (mood: number) => MOOD_TONES[5 - clampMood(mood)];

/** Feelings shown before the row is collapsed behind a toggle. */
const VISIBLE_FEELINGS = 8;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** How long typing pauses before a search actually hits the network. */
const SEARCH_DEBOUNCE_MS = 300;

/** Voice entries read better as their summary than as a raw transcript. */
const previewLine = (entry: Entry) => entry.transcriptSummary || entryPreview(entry);

/** The Timeline's own paged, filtered view of the journal — separate from the
    unfiltered feed `useEntries` loads, since filters and search now run server-side. */
interface QueryState {
  entries: Entry[];
  hasMore: boolean;
  status: "loading" | "ready" | "error";
  loadingMore: boolean;
}

const History = () => {
  const { entryCount, loading } = useEntries();
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [showAllFeelings, setShowAllFeelings] = useState(false);
  const [params, setParams] = useSearchParams();
  const [reloadKey, setReloadKey] = useState(0);

  // Filters live in the URL so a filtered Timeline can be linked to from
  // Patterns and the back button leaves the page instead of undoing chips.
  const modeParam = params.get("mode") ?? "all";
  const mode = modeParam === "all" || modeParam in MODE_META ? modeParam : "all";
  const feelingKey = params.get("feeling") ?? "";
  const feelings = useMemo(() => feelingKey.split(",").filter(Boolean), [feelingKey]);
  const keptOnly = params.get("kept") === "1";
  const onDayParam = params.get("on") ?? "";
  const onDay = DAY_PATTERN.test(onDayParam) ? onDayParam : "";

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const toggleFeeling = (feeling: string) =>
    setParam(
      "feeling",
      (feelings.includes(feeling) ? feelings.filter((f) => f !== feeling) : [...feelings, feeling]).join(","),
    );

  // Typing settles before it becomes a request, so it does not fire one per keystroke.
  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [searchInput]);

  const filters: EntryFilters = useMemo(
    () => ({
      search: debouncedSearch || undefined,
      mode: mode !== "all" ? (mode as EntryMode) : undefined,
      feelings: feelings.length ? feelings : undefined,
      keptOnly: keptOnly || undefined,
      day: onDay || undefined,
    }),
    [debouncedSearch, mode, feelings, keptOnly, onDay],
  );

  // The chip bar needs every feeling used across the whole journal, not just whatever
  // page happens to be loaded, so it comes from the same whole-history aggregate
  // Patterns already reads — ordered by count descending, uncapped.
  const [feelingOptions, setFeelingOptions] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("entry_stats");
      if (cancelled || error || !isEntryStats(data)) return;
      setFeelingOptions(data.feelings.map((f) => f.feeling));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const shownFeelings = showAllFeelings
    ? feelingOptions
    : feelingOptions.filter((f, i) => i < VISIBLE_FEELINGS || feelings.includes(f));

  const [queryState, setQueryState] = useState<QueryState>({
    entries: [],
    hasMore: false,
    status: "loading",
    loadingMore: false,
  });
  // Guards against a slow response landing after a faster, newer one — only the
  // response matching the latest request is ever allowed to update state.
  const requestIdRef = useRef(0);
  const pageRef = useRef(0);

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    pageRef.current = 0;
    setQueryState((s) => ({ ...s, status: "loading" }));
    queryEntries(filters, 0)
      .then((page) => {
        if (requestId !== requestIdRef.current) return;
        setQueryState({ entries: page.entries, hasMore: page.hasMore, status: "ready", loadingMore: false });
      })
      .catch(() => {
        if (requestId !== requestIdRef.current) return;
        setQueryState({ entries: [], hasMore: false, status: "error", loadingMore: false });
      });
  }, [filters, reloadKey]);

  const loadMore = useCallback(() => {
    if (queryState.status !== "ready" || !queryState.hasMore || queryState.loadingMore) return;
    const requestId = requestIdRef.current;
    const nextPage = pageRef.current + 1;
    setQueryState((s) => ({ ...s, loadingMore: true }));
    queryEntries(filters, nextPage)
      .then((page) => {
        if (requestId !== requestIdRef.current) return;
        pageRef.current = nextPage;
        setQueryState((s) => ({
          entries: [...s.entries, ...page.entries],
          hasMore: page.hasMore,
          status: "ready",
          loadingMore: false,
        }));
      })
      .catch(() => {
        if (requestId !== requestIdRef.current) return;
        // A failed page keeps what already loaded; the sentinel will retry on next scroll.
        setQueryState((s) => ({ ...s, loadingMore: false }));
      });
  }, [filters, queryState.status, queryState.hasMore, queryState.loadingMore]);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || queryState.status !== "ready" || !queryState.hasMore) return;
    const observer = new IntersectionObserver(
      (observed) => {
        if (observed[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "200px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [queryState.status, queryState.hasMore, loadMore]);

  const results = queryState.entries;

  const grouped = useMemo(() => {
    const map = new Map<string, typeof results>();
    results.forEach((e) => {
      const date = new Date(e.createdAt);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      map.set(key, [...(map.get(key) ?? []), e]);
    });
    return [...map.entries()]
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .map(([key, items]) => {
        const [year, month] = key.split("-").map(Number);
        const label = new Date(year, month - 1, 1).toLocaleDateString(undefined, {
          month: "long",
          year: "numeric",
        });
        const short = new Date(year, month - 1, 1).toLocaleDateString(undefined, {
          month: "short",
          year: "2-digit",
        });
        return [key, label, short, items] as const;
      });
  }, [results]);

  const filtersOn = Boolean(debouncedSearch || mode !== "all" || keptOnly || onDay || feelings.length);

  const jumpToMonth = (key: string) =>
    document.getElementById(`month-${key}`)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <AppShell>
      <header className="animate-fade">
        <h1 className="page-title">Timeline</h1>
        <div className="page-underline mt-3" />
        <p className="mt-4 text-sm text-muted-foreground">
          {loading ? (
            "Loading your entries…"
          ) : (
            <>
              <span className="mark">
                {entryCount} {entryCount === 1 ? "entry" : "entries"}
              </span>{" "}
              so far. Gaps are not failures.
            </>
          )}
        </p>
      </header>

      <div className="surface mt-8 flex items-center gap-3 px-4">
        <Search className="h-4 w-4 text-accent" />
        <Input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search words, feelings, transcripts…"
          className="h-12 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {["all", ...Object.keys(MODE_META)].map((m) => {
          const meta = m === "all" ? null : MODE_META[m as keyof typeof MODE_META];
          return (
            <button
              key={m}
              onClick={() => setParam("mode", m === "all" ? "" : m)}
              className={cn("chip inline-flex items-center gap-1.5", mode === m && "chip-active")}
            >
              {meta && (
                <meta.icon
                  className="h-3.5 w-3.5"
                  style={modeGlyphStyle(m as keyof typeof MODE_META)}
                  aria-hidden="true"
                />
              )}
              {meta ? meta.label : "Everything"}
            </button>
          );
        })}
        <button
          onClick={() => setParam("kept", keptOnly ? "" : "1")}
          className={cn("chip", keptOnly && "chip-active")}
        >
          Kept
        </button>
      </div>

      {feelingOptions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {shownFeelings.map((f) => (
            <button
              key={f}
              onClick={() => toggleFeeling(f)}
              className={cn("chip", feelings.includes(f) && "chip-active")}
            >
              {f}
            </button>
          ))}
          {feelingOptions.length > VISIBLE_FEELINGS && (
            <button
              onClick={() => setShowAllFeelings((v) => !v)}
              className="chip border-dashed"
              aria-expanded={showAllFeelings}
            >
              {showAllFeelings ? "Fewer feelings" : "All feelings"}
            </button>
          )}
        </div>
      )}

      {onDay && (
        <div className="mt-3">
          <button onClick={() => setParam("on", "")} className="chip chip-active inline-flex items-center gap-1.5">
            {new Date(`${onDay}T12:00:00`).toLocaleDateString(undefined, {
              weekday: "short",
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
            <X className="h-3 w-3" />
            <span className="sr-only">Clear the day filter</span>
          </button>
        </div>
      )}

      {queryState.status === "error" ? (
        <div className="mt-16 text-sm text-muted-foreground">
          <p>Something went wrong loading your entries.</p>
          <button
            onClick={() => setReloadKey((k) => k + 1)}
            className="mt-2 underline underline-offset-4"
          >
            Try again
          </button>
        </div>
      ) : queryState.status === "loading" ? (
        <p className="mt-16 text-sm text-muted-foreground">Loading your entries…</p>
      ) : results.length === 0 ? (
        filtersOn ? (
          <p className="mt-16 text-sm text-muted-foreground">Nothing matches that search.</p>
        ) : (
          <div className="mt-12">
            <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
              <span className="mark">Nothing here yet.</span> Entries land here as you check in, newest first, laid
              out like the row below.{" "}
              <Link to="/journal" className="underline underline-offset-4">
                Start with thirty seconds
              </Link>
              .
            </p>
            <p className="eyebrow mt-6">Example</p>
            <div
              className="mt-2 flex max-w-md gap-4 rounded-2xl border border-dashed border-border/70 p-4 opacity-70"
              aria-hidden="true"
            >
              <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full border border-dashed border-border" />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline gap-x-3 text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">Tue, 3 Jun</span>
                  <span className="uppercase tracking-[0.14em]">Voice</span>
                  <span>Even</span>
                </span>
                <span className="mt-1 block text-sm leading-relaxed">
                  The first couple of lines of what you said would show here.
                </span>
              </span>
            </div>
          </div>
        )
      ) : (
        <>
          {grouped.length > 1 && (
            <div className="mt-6 -mx-5 flex items-center gap-2 overflow-x-auto px-5 pb-1 sm:-mx-8 sm:px-8">
              <span className="eyebrow shrink-0">Jump to</span>
              {grouped.map(([key, label, short]) => (
                <button
                  key={key}
                  onClick={() => jumpToMonth(key)}
                  className="chip shrink-0 whitespace-nowrap"
                  aria-label={`Jump to ${label}`}
                >
                  {short}
                </button>
              ))}
            </div>
          )}

          <div className="mt-8 space-y-10">
            {grouped.map(([key, month, , items]) => (
              <section key={key}>
                <h2
                  id={`month-${key}`}
                  className="section-label sticky top-0 z-10 scroll-mt-2 bg-background/90 py-2 backdrop-blur"
                >
                  {month}
                </h2>
                <ul className="mt-4 space-y-2">
                  {items.map((entry) => {
                    const entryMeta = MODE_META[entry.mode];
                    return (
                    <li key={entry.id}>
                      <Link
                        to={`/entry/${entry.id}`}
                        className="surface-hover group flex gap-4 rounded-2xl border border-transparent p-4 hover:border-border/70 hover:bg-card"
                      >
                        <span
                          title={MOOD_LABELS[clampMood(entry.mood) - 1]}
                          className={cn(
                            "mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ring-4 ring-accent/10 transition-transform duration-300 group-hover:scale-125",
                            moodTone(entry.mood),
                          )}
                        >
                          <span className="sr-only">{MOOD_LABELS[clampMood(entry.mood) - 1]} mood</span>
                        </span>
                        <span className="min-w-0">
                          <span className="flex flex-wrap items-baseline gap-x-3 text-xs text-muted-foreground">
                            <span className="font-semibold text-foreground">
                              {new Date(entry.createdAt).toLocaleDateString(undefined, {
                                weekday: "short",
                                day: "numeric",
                                month: "short",
                              })}
                            </span>
                            <span className="inline-flex items-center gap-1 uppercase tracking-[0.14em]">
                              <entryMeta.icon
                                className="h-3 w-3"
                                style={modeGlyphStyle(entry.mode)}
                                aria-hidden="true"
                              />
                              {entryMeta.label}
                            </span>
                            <span className="text-accent">{MOOD_LABELS[entry.mood - 1]}</span>
                          </span>
                          {entry.title && (
                            <span className="mt-1 block font-display text-lg font-semibold">{entry.title}</span>
                          )}
                          <span className="mt-1 line-clamp-2 block text-sm leading-relaxed">
                            {previewLine(entry)}
                          </span>
                        </span>
                      </Link>
                    </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>

          {queryState.hasMore && (
            <div ref={sentinelRef} className="mt-6 h-4">
              {queryState.loadingMore && (
                <p className="text-center text-xs text-muted-foreground">Loading more…</p>
              )}
            </div>
          )}
        </>
      )}
    </AppShell>
  );
};

export default History;
