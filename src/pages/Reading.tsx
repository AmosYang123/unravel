import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Loader2, RefreshCw } from "lucide-react";
import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { fetchArticleRecs, type ArticleRec } from "@/lib/articles";
import { useEntries, useSettings } from "@/lib/store";

const Reading = () => {
  const { entries } = useEntries();
  const { settings } = useSettings();
  const [items, setItems] = useState<ArticleRec[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [curated, setCurated] = useState(false);
  const [unchanged, setUnchanged] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);

  const load = useCallback(
    async (refresh: boolean) => {
      if (refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);
      try {
        const res = await fetchArticleRecs(entries, settings, refresh);
        setItems(res.items);
        setGeneratedAt(res.generatedAt);
        setCurated(Boolean(res.curated));
        setUnchanged(refresh && Boolean(res.unchanged));
      } catch (err) {
        console.error("fetchArticleRecs failed:", err);
        setError("Couldn't load the reading shelf just now.");
      } finally {
        setRefreshing(false);
        setLoading(false);
      }
    },
    [entries, settings],
  );

  const entriesKey = entries.map((e) => e.id).join(",");
  // What the shelf is built from besides the entries: the privacy switch and
  // the first-run answers. Change one of those and the shelf should follow.
  const readerKey = [
    settings.aiSuggestionsEnabled,
    settings.yearLevel,
    settings.focusAreas.join("|"),
    settings.goals.join("|"),
    settings.interests.join("|"),
  ].join("~");

  useEffect(() => {
    void load(false);
    // Reload when the entries or those answers change; refreshing is otherwise explicit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entriesKey, readerKey]);

  const sections = useMemo(() => {
    const map = new Map<string, { note: string | null; articles: ArticleRec[] }>();
    items.forEach((item) => {
      const bucket = map.get(item.category) ?? { note: item.note, articles: [] };
      bucket.articles.push(item);
      map.set(item.category, bucket);
    });
    return [...map.entries()].map(([category, value]) => ({ category, ...value }));
  }, [items]);

  const visible = active ? sections.filter((s) => s.category === active) : sections;

  return (
    <AppShell>
      <header className="animate-fade">
        <h1 className="page-title">Reading</h1>
        <div className="page-underline mt-3" />
        <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
          A small shelf of articles, gathered around whatever you've been carrying lately.{" "}
          <span className="mark">Nothing to finish</span> — read one, or none.
        </p>
        {!settings.aiSuggestionsEnabled && (
          <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
            AI suggestions are off, so nothing you've written is sent for this. New shelves are built from what
            you told us when you set up instead. Turn suggestions back on in Settings to include your entries.
          </p>
        )}
      </header>

      {loading ? (
        <div className="mt-12 flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-accent" /> Looking for something worth your time…
        </div>
      ) : error ? (
        <div className="surface mt-10 p-5">
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" className="mt-4" onClick={() => void load(true)}>
            Try again
          </Button>
        </div>
      ) : (
        <>
          {sections.length > 1 && (
            <div className="mt-8 flex flex-wrap gap-2">
              <button
                onClick={() => setActive(null)}
                className={`chip ${active === null ? "chip-active" : ""}`}
              >
                Everything
              </button>
              {sections.map((s) => (
                <button
                  key={s.category}
                  onClick={() => setActive(s.category)}
                  className={`chip ${active === s.category ? "chip-active" : ""}`}
                >
                  {s.category}
                </button>
              ))}
            </div>
          )}

          <div className="mt-10 space-y-12">
            {visible.map((section) => (
              <section key={section.category}>
                <h2 className="section-label">{section.category}</h2>
                {section.note && <p className="mt-2 text-sm text-muted-foreground">{section.note}</p>}
                <div className="mt-5 space-y-4">
                  {section.articles.map((a) => (
                    <a
                      key={a.id}
                      href={a.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="surface surface-hover group relative block overflow-hidden p-5 hover:-translate-y-0.5"
                    >
                      <span className="absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b from-accent/70 to-accent/10 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                      <div className="flex items-start justify-between gap-4">
                        <h3 className="font-display text-lg font-semibold leading-snug">{a.title}</h3>
                        <ArrowUpRight className="mt-1 h-4 w-4 shrink-0 text-accent transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                      </div>
                      <p className="mt-2 eyebrow">
                        {[a.source, a.minutes ? `${a.minutes} min` : null].filter(Boolean).join(" · ")}
                      </p>
                      {a.summary && <p className="mt-3 text-sm text-muted-foreground">{a.summary}</p>}
                      {a.why && (
                        <p className="mt-3 border-l-2 border-accent/40 pl-3 text-sm leading-relaxed">
                          {a.why}
                        </p>
                      )}
                    </a>
                  ))}
                </div>
              </section>
            ))}
          </div>


          {!sections.length && (
            <p className="mt-10 text-sm text-muted-foreground">
              Nothing here yet. Check in once and the shelf fills in.
            </p>
          )}

          <div className="mt-14 flex flex-wrap items-center gap-4">
            <Button variant="outline" onClick={() => void load(true)} disabled={refreshing}>
              {refreshing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Find newer articles
            </Button>
            {generatedAt && (
              <p className="text-xs text-muted-foreground">
                Gathered {new Date(generatedAt).toLocaleDateString(undefined, {
                  month: "long",
                  day: "numeric",
                })}
              </p>
            )}
          </div>

          {unchanged ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Nothing new right now — this is the same shelf as before.
            </p>
          ) : (
            curated && (
              <p className="mt-2 text-xs text-muted-foreground">
                This shelf is from our own list today, not a live search.
              </p>
            )
          )}
        </>
      )}
    </AppShell>
  );
};

export default Reading;
