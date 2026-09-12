import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Linking, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowUpRight, Loader2, RefreshCw } from "lucide-react-native";
import { Button, Chip, PageTitle, PageUnderline, SectionLabel, Surface } from "@/components/ui";
import { fetchArticleRecs, type ArticleRec } from "@/lib/articles";
import { useEntries, useSettings } from "@/lib/store";
import { useStyles, useTheme } from "@/theme/ThemeProvider";
import type { FontSet } from "@/theme/tokens";

interface Section {
  category: string;
  note: string | null;
  articles: ArticleRec[];
}

/** One row in the shelf's FlatList: either a section header or a section's articles. */
type Row = { kind: "header"; section: Section } | { kind: "article"; article: ArticleRec };

export default function ReadingScreen() {
  const { theme, fonts } = useTheme();
  const styles = useStyles(createStyles);
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
      if (refresh) setRefreshing(true);
      else setLoading(true);
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

  const sections = useMemo<Section[]>(() => {
    const map = new Map<string, Section>();
    items.forEach((item) => {
      const bucket = map.get(item.category) ?? { category: item.category, note: item.note, articles: [] };
      bucket.articles.push(item);
      map.set(item.category, bucket);
    });
    return [...map.values()];
  }, [items]);

  const visible = active ? sections.filter((s) => s.category === active) : sections;

  const rows = useMemo<Row[]>(
    () =>
      visible.flatMap((section) => [
        { kind: "header" as const, section },
        ...section.articles.map((article) => ({ kind: "article" as const, article })),
      ]),
    [visible],
  );

  const openArticle = (url: string) => {
    void Linking.openURL(url);
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]} edges={["top"]}>
      <FlatList
        data={rows}
        keyExtractor={(row) => (row.kind === "header" ? `h-${row.section.category}` : row.article.id)}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View>
            <View>
              <PageTitle>Reading</PageTitle>
              <PageUnderline style={styles.underline} />
              <Text style={[styles.intro, { color: theme.colors.mutedForeground }]}>
                A small shelf of articles, gathered around whatever you've been carrying lately.{" "}
                <Text style={{ color: theme.colors.foreground, fontFamily: fonts.bodySemiBold }}>
                  Nothing to finish
                </Text>{" "}
                — read one, or none.
              </Text>
              {!settings.aiSuggestionsEnabled && (
                <Text style={[styles.privacyNote, { color: theme.colors.mutedForeground }]}>
                  AI suggestions are off, so nothing you've written is sent for this. New shelves are built
                  from what you told us when you set up instead. Turn suggestions back on in Settings to
                  include your entries.
                </Text>
              )}
            </View>

            {loading ? (
              <View style={styles.statusRow}>
                <Loader2 color={theme.colors.accent} size={16} />
                <Text style={[styles.statusText, { color: theme.colors.mutedForeground }]}>
                  Looking for something worth your time…
                </Text>
              </View>
            ) : error ? (
              <Surface style={styles.errorSurface}>
                <Text style={[styles.statusText, { color: theme.colors.mutedForeground }]}>{error}</Text>
                <Button
                  variant="ghost"
                  label="Try again"
                  onPress={() => void load(true)}
                  style={styles.retryButton}
                />
              </Surface>
            ) : (
              sections.length > 1 && (
                <View style={styles.chipRow}>
                  <Chip label="Everything" selected={active === null} onPress={() => setActive(null)} />
                  {sections.map((s) => (
                    <Chip
                      key={s.category}
                      label={s.category}
                      selected={active === s.category}
                      onPress={() => setActive(s.category)}
                    />
                  ))}
                </View>
              )
            )}

            {!loading && !error && !sections.length && (
              <Text style={[styles.emptyText, { color: theme.colors.mutedForeground }]}>
                Nothing here yet. Check in once and the shelf fills in.
              </Text>
            )}
          </View>
        }
        renderItem={({ item }) => {
          if (item.kind === "header") {
            return (
              <View style={styles.sectionHeader}>
                <SectionLabel>{item.section.category}</SectionLabel>
                {Boolean(item.section.note) && (
                  <Text style={[styles.sectionNote, { color: theme.colors.mutedForeground }]}>
                    {item.section.note}
                  </Text>
                )}
              </View>
            );
          }
          const a = item.article;
          return (
            <Surface onPress={() => openArticle(a.url)} style={styles.articleCard}>
              <View style={styles.articleTitleRow}>
                <Text style={[styles.articleTitle, { color: theme.colors.foreground }]}>{a.title}</Text>
                <ArrowUpRight size={16} color={theme.colors.accent} style={styles.articleIcon} />
              </View>
              <Text style={[styles.articleMeta, { color: theme.colors.mutedForeground }]}>
                {[a.source, a.minutes ? `${a.minutes} min` : null].filter(Boolean).join(" · ")}
              </Text>
              {Boolean(a.summary) && (
                <Text style={[styles.articleSummary, { color: theme.colors.mutedForeground }]}>{a.summary}</Text>
              )}
              {Boolean(a.why) && (
                <View style={[styles.whyBox, { borderColor: theme.colors.accent }]}>
                  <Text style={[styles.whyText, { color: theme.colors.foreground }]}>{a.why}</Text>
                </View>
              )}
            </Surface>
          );
        }}
        ListFooterComponent={
          !loading && !error ? (
            <View style={styles.footer}>
              <Button
                variant="ghost"
                icon={<RefreshCw size={16} color={theme.colors.foreground} />}
                label="Find newer articles"
                onPress={() => void load(true)}
                disabled={refreshing}
              />
              {generatedAt && (
                <Text style={[styles.generatedAt, { color: theme.colors.mutedForeground }]}>
                  Gathered{" "}
                  {new Date(generatedAt).toLocaleDateString(undefined, { month: "long", day: "numeric" })}
                </Text>
              )}
              {unchanged ? (
                <Text style={[styles.footerNote, { color: theme.colors.mutedForeground }]}>
                  Nothing new right now — this is the same shelf as before.
                </Text>
              ) : (
                curated && (
                  <Text style={[styles.footerNote, { color: theme.colors.mutedForeground }]}>
                    This shelf is from our own list today, not a live search.
                  </Text>
                )
              )}
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const createStyles = (fonts: FontSet) => StyleSheet.create({
  safe: { flex: 1 },
  listContent: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 48 },
  underline: { marginTop: 12 },
  intro: { marginTop: 16, maxWidth: 420, fontFamily: fonts.body, fontSize: 14, lineHeight: 21 },
  privacyNote: { marginTop: 12, maxWidth: 420, fontFamily: fonts.body, fontSize: 14, lineHeight: 21 },
  statusRow: { marginTop: 32, flexDirection: "row", alignItems: "center", gap: 10 },
  statusText: { fontFamily: fonts.body, fontSize: 14 },
  errorSurface: { marginTop: 24 },
  retryButton: { marginTop: 16, alignSelf: "flex-start" },
  chipRow: { marginTop: 24, flexDirection: "row", flexWrap: "wrap", gap: 8 },
  emptyText: { marginTop: 24, fontFamily: fonts.body, fontSize: 14 },
  sectionHeader: { marginTop: 32, marginBottom: 16 },
  sectionNote: { marginTop: 8, fontFamily: fonts.body, fontSize: 14 },
  articleCard: { marginBottom: 12 },
  articleTitleRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  articleTitle: { flexShrink: 1, fontFamily: fonts.display, fontSize: 17, lineHeight: 22 },
  articleIcon: { marginTop: 2 },
  articleMeta: { marginTop: 8, fontFamily: fonts.bodySemiBold, fontSize: 11, letterSpacing: 1, textTransform: "uppercase" },
  articleSummary: { marginTop: 10, fontFamily: fonts.body, fontSize: 14, lineHeight: 21 },
  whyBox: { marginTop: 12, borderLeftWidth: 2, paddingLeft: 10 },
  whyText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21 },
  footer: { marginTop: 24, alignItems: "flex-start", gap: 8 },
  generatedAt: { fontFamily: fonts.body, fontSize: 12 },
  footerNote: { fontFamily: fonts.body, fontSize: 12 },
});
