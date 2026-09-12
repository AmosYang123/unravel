import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { Search } from "lucide-react-native";
import { Chip, PageTitle, PageUnderline, withAlpha } from "@/components/ui";
import { entryPreview, MODE_META, modeGlyphColor, MOOD_LABELS } from "@/lib/content";
import { supabase } from "@/integrations/supabase/client";
import { isEntryStats } from "@/lib/insights";
import { queryEntries, useEntries, type EntryFilters } from "@/lib/store";
import type { Entry, EntryMode } from "@/lib/types";
import { useStyles, useTheme } from "@/theme/ThemeProvider";
import type { FontSet } from "@/theme/tokens";

/** Accent opacity per mood step, brightest at the top — the RN equivalent of
    the web's MOOD_TONES accent tints. */
const MOOD_OPACITIES = [0.7, 0.55, 0.4, 0.25, 0.15];
const clampMood = (mood: number) => Math.min(Math.max(mood, 1), 5);
const moodOpacity = (mood: number) => MOOD_OPACITIES[5 - clampMood(mood)] ?? 0.15;

/** Feelings shown before the row is collapsed behind a toggle. */
const VISIBLE_FEELINGS = 8;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** How long typing pauses before a search actually hits the network. */
const SEARCH_DEBOUNCE_MS = 300;

/** Voice entries read better as their summary than as a raw transcript. */
const previewLine = (entry: Entry) => entry.transcriptSummary || entryPreview(entry);

const asString = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? "") : (v ?? ""));

/** The Timeline's own paged, filtered view of the journal — separate from the
    unfiltered feed `useEntries` loads, since filters and search run server-side. */
interface QueryState {
  entries: Entry[];
  hasMore: boolean;
  status: "loading" | "ready" | "error";
  loadingMore: boolean;
}

interface Section {
  key: string;
  label: string;
  short: string;
  data: Entry[];
}

export default function TimelineScreen() {
  const { theme, fonts } = useTheme();
  const styles = useStyles(createStyles);
  const router = useRouter();
  // Filters live in local search params so a filtered Timeline can be linked to
  // from Patterns, mirroring the web app's URL-params approach.
  const params = useLocalSearchParams<{ mode?: string; feeling?: string; kept?: string; on?: string }>();
  const { entryCount, loading } = useEntries();

  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [showAllFeelings, setShowAllFeelings] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const modeParam = asString(params.mode) || "all";
  const mode = modeParam === "all" || modeParam in MODE_META ? modeParam : "all";
  const feelingKey = asString(params.feeling);
  const feelings = useMemo(() => feelingKey.split(",").filter(Boolean), [feelingKey]);
  const keptOnly = asString(params.kept) === "1";
  const onDayParam = asString(params.on);
  const onDay = DAY_PATTERN.test(onDayParam) ? onDayParam : "";

  const setParam = (key: "mode" | "feeling" | "kept" | "on", value: string) => {
    router.setParams({ [key]: value || undefined });
  };

  const toggleFeeling = (feeling: string) =>
    setParam(
      "feeling",
      (feelings.includes(feeling) ? feelings.filter((f) => f !== feeling) : [...feelings, feeling]).join(","),
    );

  // Typing settles before it becomes a request, so it does not fire one per keystroke.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
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
  // page happens to be loaded, ordered by count descending, uncapped.
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
        // A failed page keeps what already loaded; scrolling to the end will retry.
        setQueryState((s) => ({ ...s, loadingMore: false }));
      });
  }, [filters, queryState.status, queryState.hasMore, queryState.loadingMore]);

  const results = queryState.entries;

  const sections: Section[] = useMemo(() => {
    const map = new Map<string, Entry[]>();
    results.forEach((e) => {
      const date = new Date(e.createdAt);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      map.set(key, [...(map.get(key) ?? []), e]);
    });
    return [...map.entries()]
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .map(([key, items]) => {
        const [yearPart, monthPart] = key.split("-");
        const year = Number(yearPart);
        const month = Number(monthPart);
        const label = new Date(year, month - 1, 1).toLocaleDateString(undefined, {
          month: "long",
          year: "numeric",
        });
        const short = new Date(year, month - 1, 1).toLocaleDateString(undefined, {
          month: "short",
          year: "2-digit",
        });
        return { key, label, short, data: items };
      });
  }, [results]);

  const filtersOn = Boolean(debouncedSearch || mode !== "all" || keptOnly || onDay || feelings.length);

  const listRef = useRef<SectionList<Entry, Section>>(null);
  const jumpToMonth = (key: string) => {
    const sectionIndex = sections.findIndex((s) => s.key === key);
    if (sectionIndex === -1) return;
    listRef.current?.scrollToLocation({ sectionIndex, itemIndex: 0, animated: true, viewOffset: 0 });
  };

  const ready = queryState.status === "ready";

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]} edges={["top"]}>
      <SectionList<Entry, Section>
        ref={listRef}
        sections={ready ? sections : []}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled
        onEndReachedThreshold={0.4}
        onEndReached={loadMore}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View>
            <View style={styles.header}>
              <PageTitle>Timeline</PageTitle>
              <PageUnderline style={styles.underline} />
              <Text style={[styles.subhead, { color: theme.colors.mutedForeground }]}>
                {loading ? (
                  "Loading your entries…"
                ) : (
                  <>
                    <Text style={{ color: theme.colors.foreground, fontFamily: fonts.bodySemiBold }}>
                      {entryCount} {entryCount === 1 ? "entry" : "entries"}
                    </Text>{" "}
                    so far. Gaps are not failures.
                  </>
                )}
              </Text>
            </View>

            <View
              style={[
                styles.searchBar,
                { backgroundColor: theme.colors.card, borderColor: withAlpha(theme.colors.border, 0.7) },
              ]}
            >
              <Search size={16} color={theme.colors.accent} strokeWidth={1.75} />
              <TextInput
                value={searchInput}
                onChangeText={setSearchInput}
                placeholder="Search words, feelings, transcripts…"
                placeholderTextColor={theme.colors.mutedForeground}
                style={[styles.searchInput, { color: theme.colors.foreground }]}
              />
            </View>

            <View style={styles.chipRow}>
              {(["all", ...(Object.keys(MODE_META) as EntryMode[])] as const).map((m) => (
                <Chip
                  key={m}
                  label={m === "all" ? "Everything" : MODE_META[m as EntryMode].label}
                  selected={mode === m}
                  onPress={() => setParam("mode", m === "all" ? "" : m)}
                />
              ))}
              <Chip label="Kept" selected={keptOnly} onPress={() => setParam("kept", keptOnly ? "" : "1")} />
            </View>

            {feelingOptions.length > 0 && (
              <View style={styles.chipRow}>
                {shownFeelings.map((f) => (
                  <Chip key={f} label={f} selected={feelings.includes(f)} onPress={() => toggleFeeling(f)} />
                ))}
                {feelingOptions.length > VISIBLE_FEELINGS && (
                  <Chip
                    label={showAllFeelings ? "Fewer feelings" : "All feelings"}
                    onPress={() => setShowAllFeelings((v) => !v)}
                  />
                )}
              </View>
            )}

            {Boolean(onDay) && (
              <View style={styles.chipRow}>
                <Chip
                  label={new Date(`${onDay}T12:00:00`).toLocaleDateString(undefined, {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                  selected
                  onPress={() => setParam("on", "")}
                  accessibilityLabel="Clear the day filter"
                />
              </View>
            )}

            {ready && sections.length > 1 && (
              <View style={styles.jumpRow}>
                <Text style={[styles.jumpLabel, { color: theme.colors.mutedForeground }]}>Jump to</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {sections.map((s) => (
                    <View key={s.key} style={styles.jumpChip}>
                      <Chip label={s.short} onPress={() => jumpToMonth(s.key)} />
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={[styles.sectionHeader, { backgroundColor: theme.colors.background }]}>
            <Text style={[styles.sectionLabel, { color: theme.colors.mutedForeground }]}>{section.label}</Text>
          </View>
        )}
        renderItem={({ item: entry }) => {
          const entryMeta = MODE_META[entry.mode];
          const Icon = entryMeta.icon;
          return (
            <Link href={`/entry/${entry.id}`} asChild>
              <Pressable style={styles.row}>
                <View
                  style={[
                    styles.moodDot,
                    { backgroundColor: withAlpha(theme.colors.accent, moodOpacity(entry.mood)) },
                  ]}
                />
                <View style={styles.rowBody}>
                  <View style={styles.rowMeta}>
                    <Text style={[styles.rowDate, { color: theme.colors.foreground }]}>
                      {new Date(entry.createdAt).toLocaleDateString(undefined, {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                      })}
                    </Text>
                    <View style={styles.rowMode}>
                      <Icon size={11} color={modeGlyphColor(entry.mode, theme.colors.accent)} strokeWidth={1.75} />
                      <Text style={[styles.rowModeLabel, { color: theme.colors.mutedForeground }]}>
                        {entryMeta.label}
                      </Text>
                    </View>
                    <Text style={[styles.rowMoodLabel, { color: theme.colors.accent }]}>
                      {MOOD_LABELS[clampMood(entry.mood) - 1]}
                    </Text>
                  </View>
                  {Boolean(entry.title) && (
                    <Text style={[styles.rowTitle, { color: theme.colors.foreground }]}>{entry.title}</Text>
                  )}
                  <Text style={[styles.rowPreview, { color: theme.colors.foreground }]} numberOfLines={2}>
                    {previewLine(entry)}
                  </Text>
                </View>
              </Pressable>
            </Link>
          );
        }}
        ListEmptyComponent={
          queryState.status === "error" ? (
            <View style={styles.stateBlock}>
              <Text style={[styles.stateText, { color: theme.colors.mutedForeground }]}>
                Something went wrong loading your entries.
              </Text>
              <Pressable onPress={() => setReloadKey((k) => k + 1)}>
                <Text style={[styles.retry, { color: theme.colors.foreground }]}>Try again</Text>
              </Pressable>
            </View>
          ) : queryState.status === "loading" ? (
            <View style={styles.stateBlock}>
              <Text style={[styles.stateText, { color: theme.colors.mutedForeground }]}>
                Loading your entries…
              </Text>
            </View>
          ) : filtersOn ? (
            <View style={styles.stateBlock}>
              <Text style={[styles.stateText, { color: theme.colors.mutedForeground }]}>
                Nothing matches that search.
              </Text>
            </View>
          ) : (
            <View style={styles.emptyBlock}>
              <Text style={[styles.emptyCopy, { color: theme.colors.mutedForeground }]}>
                <Text style={{ color: theme.colors.foreground, fontFamily: fonts.bodySemiBold }}>
                  Nothing here yet.
                </Text>{" "}
                Entries land here as you check in, newest first, laid out like the row below.{" "}
                <Link href="/" style={styles.emptyLink}>
                  Start with thirty seconds
                </Link>
                <Text>.</Text>
              </Text>
              <Text style={[styles.exampleLabel, { color: theme.colors.mutedForeground }]}>Example</Text>
              <View
                style={[styles.ghostRow, { borderColor: withAlpha(theme.colors.border, 0.7), opacity: 0.7 }]}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                <View style={[styles.ghostDot, { borderColor: withAlpha(theme.colors.border, 0.9) }]} />
                <View style={styles.ghostLines}>
                  <View style={styles.exampleMeta}>
                    <Text style={[styles.exampleDate, { color: theme.colors.foreground }]}>Tue, 3 Jun</Text>
                    <Text style={[styles.exampleMode, { color: theme.colors.mutedForeground }]}>Voice</Text>
                    <Text style={[styles.exampleMood, { color: theme.colors.mutedForeground }]}>Even</Text>
                  </View>
                  <Text style={[styles.examplePreview, { color: theme.colors.mutedForeground }]}>
                    The first couple of lines of what you said would show here.
                  </Text>
                </View>
              </View>
            </View>
          )
        }
        ListFooterComponent={
          ready && queryState.hasMore && queryState.loadingMore ? (
            <View style={styles.footer}>
              <ActivityIndicator color={theme.colors.mutedForeground} size="small" />
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const createStyles = (fonts: FontSet) => StyleSheet.create({
  safe: { flex: 1 },
  listContent: { paddingHorizontal: 20, paddingBottom: 40 },
  header: { paddingTop: 24 },
  underline: { marginTop: 12 },
  subhead: { fontFamily: fonts.body, fontSize: 14, marginTop: 16 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    paddingHorizontal: 14,
    height: 48,
    marginTop: 24,
  },
  searchInput: { flex: 1, fontFamily: fonts.body, fontSize: 15, height: "100%" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  jumpRow: { marginTop: 20 },
  jumpLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    letterSpacing: 1.6,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  jumpChip: { marginRight: 8 },
  sectionHeader: { paddingTop: 20, paddingBottom: 8 },
  sectionLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    letterSpacing: 1.6,
    textTransform: "uppercase",
  },
  row: { flexDirection: "row", gap: 14, paddingVertical: 12 },
  moodDot: { width: 10, height: 10, borderRadius: 5, marginTop: 5 },
  rowBody: { flex: 1, minWidth: 0 },
  rowMeta: { flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", gap: 10 },
  rowDate: { fontFamily: fonts.bodySemiBold, fontSize: 12 },
  rowMode: { flexDirection: "row", alignItems: "center", gap: 4 },
  rowModeLabel: { fontFamily: fonts.body, fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase" },
  rowMoodLabel: { fontFamily: fonts.body, fontSize: 12 },
  rowTitle: { fontFamily: fonts.display, fontSize: 16, marginTop: 4 },
  rowPreview: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, marginTop: 4 },
  stateBlock: { paddingTop: 60, alignItems: "flex-start" },
  stateText: { fontFamily: fonts.body, fontSize: 14 },
  retry: { fontFamily: fonts.body, fontSize: 14, marginTop: 8, textDecorationLine: "underline" },
  emptyBlock: { paddingTop: 32, gap: 8 },
  ghostRow: {
    flexDirection: "row",
    gap: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: "dashed",
    borderRadius: 16,
    padding: 16,
  },
  ghostDot: { width: 10, height: 10, borderRadius: 5, borderWidth: StyleSheet.hairlineWidth, marginTop: 6 },
  ghostLines: { flex: 1, gap: 6 },
  emptyCopy: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21 },
  emptyLink: { textDecorationLine: "underline" },
  exampleLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    letterSpacing: 1.6,
    textTransform: "uppercase",
    marginTop: 20,
    marginBottom: 8,
  },
  exampleMeta: { flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", gap: 8 },
  exampleDate: { fontFamily: fonts.bodySemiBold, fontSize: 12 },
  exampleMode: { fontFamily: fonts.body, fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase" },
  exampleMood: { fontFamily: fonts.body, fontSize: 12 },
  examplePreview: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  footer: { paddingVertical: 20, alignItems: "center" },
});
