import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Loader2, TriangleAlert } from "lucide-react-native";
import { PageTitle, PageUnderline, SectionLabel, Surface, withAlpha } from "@/components/ui";
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
import { useStyles, useTheme } from "@/theme/ThemeProvider";
import type { FontSet } from "@/theme/tokens";

const round1 = (value: number) => Math.round(value * 10) / 10;

const dayName = (d: number) =>
  ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d];

const energyLabel = (avg: number) =>
  ENERGY_LABELS[Math.min(Math.max(Math.round(avg), 1), ENERGY_LABELS.length) - 1];

/** Placeholder bar heights for the drawn-but-empty chart, matching the web app's fixture shape. */
const EMPTY_BAR_HEIGHTS = [40, 60, 40, 80, 60, 60, 100, 40, 60, 80, 60, 40, 80, 60];

/** Shared frame so the empty chart and the real one read the same way as `ChartFrame` on web. */
function ChartFrame({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  const styles = useStyles(createStyles);
  return (
    <View style={styles.chartRow}>
      <View style={styles.scaleColumn}>
        {[5, 3, 1].map((v) => (
          <Text key={v} style={[styles.scaleLabel, { color: withAlpha(theme.colors.mutedForeground, 0.7) }]}>
            {v}
          </Text>
        ))}
      </View>
      <View style={styles.barsColumn}>{children}</View>
    </View>
  );
}

export default function InsightsScreen() {
  const { theme, fonts } = useTheme();
  const styles = useStyles(createStyles);
  const router = useRouter();
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

  const openDay = (iso: string) => router.push({ pathname: "/(tabs)/history", params: { on: dayParam(iso) } });
  const openFeeling = (feeling: string) => router.push({ pathname: "/(tabs)/history", params: { feeling } });

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View>
          <PageTitle>Patterns</PageTitle>
          <PageUnderline style={styles.underline} />
          <Text style={[styles.intro, { color: theme.colors.mutedForeground }]}>
            Calculated on this device, only from moods and tags you chose.{" "}
            <Text style={{ color: theme.colors.foreground, fontFamily: fonts.bodySemiBold }}>
              Your writing is never analyzed.
            </Text>
          </Text>
        </View>

        <Surface style={styles.toggleSurface}>
          <View style={styles.toggleText}>
            <Text style={[styles.toggleTitle, { color: theme.colors.foreground }]}>Show patterns</Text>
            <Text style={[styles.toggleDescription, { color: theme.colors.mutedForeground }]}>
              Turn off if you'd rather not see any of this.
            </Text>
          </View>
          <Switch
            value={settings.insightsEnabled}
            onValueChange={(v) => void update({ insightsEnabled: v })}
            accessibilityLabel="Show patterns"
            trackColor={{ true: theme.colors.accent }}
          />
        </Surface>

        {!settings.insightsEnabled ? (
          <Text style={[styles.note, { color: theme.colors.mutedForeground }]}>
            Patterns are off. Your entries are still saved.
          </Text>
        ) : loading ? (
          <View style={styles.statusRow}>
            <Loader2 color={theme.colors.mutedForeground} size={16} />
            <Text style={[styles.statusText, { color: theme.colors.mutedForeground }]}>
              Reading your patterns…
            </Text>
          </View>
        ) : loadError ? (
          <View style={styles.statusRow}>
            <TriangleAlert color={theme.colors.mutedForeground} size={14} strokeWidth={1.5} />
            <Text style={[styles.statusText, { color: theme.colors.mutedForeground }]}>
              Your patterns didn't load. Try refreshing.
            </Text>
          </View>
        ) : !stats || !stats.energy ? (
          <View style={styles.section}>
            <Surface>
              <SectionLabel>Recent energy</SectionLabel>
              <View style={styles.baselineRow}>
                <Text style={[styles.bigNumber, { color: withAlpha(theme.colors.mutedForeground, 0.4) }]}>—</Text>
                <Text style={[styles.baselineSuffix, { color: theme.colors.mutedForeground }]}>/ 5 lately</Text>
              </View>
              <ChartFrame>
                {EMPTY_BAR_HEIGHTS.map((h, i) => (
                  <View
                    key={i}
                    style={[
                      styles.emptyBar,
                      { height: `${h}%`, borderColor: withAlpha(theme.colors.border, 0.7) },
                    ]}
                  />
                ))}
              </ChartFrame>
              <View style={[styles.hairline, { backgroundColor: theme.colors.border }]} />
              <View style={styles.eyebrowRow}>
                <Text style={[styles.eyebrowText, { color: theme.colors.mutedForeground }]}>Low energy</Text>
                <Text style={[styles.eyebrowText, { color: theme.colors.mutedForeground }]}>High energy</Text>
              </View>
            </Surface>
            <Text style={[styles.note, { color: theme.colors.mutedForeground }]}>
              One bar per check-in, tallest when your energy ran high. About a week of entries and the shape starts
              to be worth looking at — the rest of this page fills in behind it.{" "}
              <Text
                style={{ color: theme.colors.foreground, textDecorationLine: "underline" }}
                onPress={() => router.push("/(tabs)")}
              >
                Check in
              </Text>
              .
            </Text>
          </View>
        ) : (
          <View style={styles.section}>
            <Surface>
              <SectionLabel>Recent energy</SectionLabel>
              <View style={styles.baselineRow}>
                <Text style={[styles.bigNumber, { color: theme.colors.foreground }]}>
                  {round1(stats.energy.recent.avg)}
                </Text>
                <Text style={[styles.baselineSuffix, { color: theme.colors.mutedForeground }]}>/ 5 lately</Text>
                <View
                  style={[
                    styles.energyBadge,
                    { borderColor: withAlpha(theme.colors.accent, 0.5), backgroundColor: withAlpha(theme.colors.accent, 0.12) },
                  ]}
                >
                  <Text style={[styles.energyBadgeText, { color: theme.colors.foreground }]}>
                    {energyLabel(stats.energy.recent.avg)}
                  </Text>
                </View>
              </View>
              <Text style={[styles.paragraph, { color: theme.colors.mutedForeground }]}>
                {stats.energy.earlier ? (
                  <>
                    Against <Text style={{ color: theme.colors.foreground }}>{round1(stats.energy.earlier.avg)}</Text>{" "}
                    across your first month — {stats.energy.earlier.n} entries then, {stats.energy.recent.n} in the
                    last thirty days.
                  </>
                ) : (
                  <>
                    From your most recent thirty days, {stats.energy.recent.n}{" "}
                    {stats.energy.recent.n === 1 ? "entry" : "entries"}. Not enough history yet to set it against
                    where you started.
                  </>
                )}
              </Text>
              <ChartFrame>
                {stats.recent.map((e) => {
                  const label = new Date(e.createdAt).toLocaleDateString(undefined, {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                  });
                  return (
                    <Text
                      key={e.id}
                      onPress={() => openDay(e.createdAt)}
                      accessibilityRole="button"
                      accessibilityLabel={`${label}, ${ENERGY_LABELS[e.energy - 1]} — open in the Timeline`}
                      style={[
                        styles.bar,
                        { height: `${(e.energy / 5) * 100}%`, backgroundColor: theme.colors.accent },
                      ]}
                    />
                  );
                })}
              </ChartFrame>
              <View style={[styles.hairline, { backgroundColor: theme.colors.border }]} />
              <View style={styles.eyebrowRow}>
                <Text style={[styles.eyebrowText, { color: theme.colors.mutedForeground }]}>Low energy</Text>
                <Text style={[styles.eyebrowText, { color: theme.colors.mutedForeground }]}>High energy</Text>
              </View>
              <Text style={[styles.tapHint, { color: theme.colors.mutedForeground }]}>Tap a bar to read that day.</Text>
            </Surface>

            {stats.feelings.length > 0 && (
              <View>
                <SectionLabel>Recurring words</SectionLabel>
                <View style={styles.feelingList}>
                  {stats.feelings.map(({ feeling, n }) => (
                    <Pressable
                      key={feeling}
                      onPress={() => openFeeling(feeling)}
                      accessibilityRole="button"
                      accessibilityLabel={`${feeling}, ${n} entries — open in the Timeline`}
                      style={styles.feelingRow}
                    >
                      <Text style={[styles.feelingLabel, { color: theme.colors.foreground }]} numberOfLines={1}>
                        {feeling}
                      </Text>
                      <View style={styles.feelingBarTrack}>
                        <View
                          style={[
                            styles.feelingBarFill,
                            { width: `${(n / stats.feelings[0]!.n) * 100}%`, backgroundColor: theme.colors.accent },
                          ]}
                        />
                      </View>
                      <Text style={[styles.feelingCount, { color: theme.colors.mutedForeground }]}>{n}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={[styles.tapHint, { color: theme.colors.mutedForeground }]}>
                  Tap a word to see those entries.
                </Text>
              </View>
            )}

            {stats.dayPart && (
              <View>
                <SectionLabel>When you write</SectionLabel>
                <Text style={[styles.paragraph, styles.paragraphLarge, { color: theme.colors.foreground }]}>
                  {stats.dayPart.dominant && (
                    <>
                      Most of your entries land in{" "}
                      <Text style={{ fontFamily: fonts.bodySemiBold }}>{stats.dayPart.dominant.label}</Text> — across{" "}
                      {stats.dayPart.dominant.n} of them.{" "}
                    </>
                  )}
                  {stats.dayPart.high && stats.dayPart.low && (
                    <>
                      {stats.dayPart.dominant?.id === stats.dayPart.high.id ? (
                        <>
                          Mood there runs higher than in {stats.dayPart.low.label} — {round1(stats.dayPart.high.mood)}{" "}
                          against {round1(stats.dayPart.low.mood)}, across {stats.dayPart.low.n} entries.
                        </>
                      ) : (
                        <>
                          Mood runs higher in{" "}
                          <Text style={{ fontFamily: fonts.bodySemiBold }}>{stats.dayPart.high.label}</Text>,{" "}
                          {round1(stats.dayPart.high.mood)} across {stats.dayPart.high.n} entries, than in{" "}
                          {stats.dayPart.low.label}, {round1(stats.dayPart.low.mood)} across {stats.dayPart.low.n}.
                        </>
                      )}{" "}
                      Might be the hour, might just be what happened those days.
                    </>
                  )}
                </Text>
              </View>
            )}

            {stats.weekday && (
              <View>
                <SectionLabel>One thing to notice</SectionLabel>
                <Text style={[styles.paragraph, styles.paragraphLarge, { color: theme.colors.foreground }]}>
                  Your energy tends to run lowest on{" "}
                  <Text style={{ fontFamily: fonts.bodySemiBold }}>{dayName(stats.weekday.low.day)}s</Text>, across{" "}
                  {stats.weekday.low.n} of them, and highest on{" "}
                  <Text style={{ fontFamily: fonts.bodySemiBold }}>{dayName(stats.weekday.high.day)}s</Text>, across{" "}
                  {stats.weekday.high.n}. That's a pattern, not a rule.
                </Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (fonts: FontSet) => StyleSheet.create({
  safe: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 48, gap: 0 },
  underline: { marginTop: 12 },
  intro: { marginTop: 16, maxWidth: 420, fontFamily: fonts.body, fontSize: 14, lineHeight: 21 },
  toggleSurface: { marginTop: 32, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16 },
  toggleText: { flexShrink: 1 },
  toggleTitle: { fontFamily: fonts.bodySemiBold, fontSize: 16 },
  toggleDescription: { marginTop: 4, fontFamily: fonts.body, fontSize: 14 },
  note: { marginTop: 24, fontFamily: fonts.body, fontSize: 14, lineHeight: 21 },
  statusRow: { marginTop: 40, flexDirection: "row", alignItems: "center", gap: 8 },
  statusText: { fontFamily: fonts.body, fontSize: 14 },
  section: { marginTop: 40, gap: 40 },
  baselineRow: { marginTop: 20, flexDirection: "row", alignItems: "baseline", gap: 8, flexWrap: "wrap" },
  bigNumber: { fontFamily: fonts.display, fontSize: 36, lineHeight: 40 },
  baselineSuffix: { fontFamily: fonts.body, fontSize: 14 },
  energyBadge: { marginLeft: "auto", borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 4 },
  energyBadgeText: { fontFamily: fonts.bodySemiBold, fontSize: 12 },
  paragraph: { marginTop: 12, fontFamily: fonts.body, fontSize: 14, lineHeight: 21 },
  paragraphLarge: { fontSize: 16, lineHeight: 24, marginTop: 16 },
  chartRow: { marginTop: 24, flexDirection: "row", gap: 10, height: 128 },
  scaleColumn: { width: 14, justifyContent: "space-between" },
  scaleLabel: { fontFamily: fonts.bodySemiBold, fontSize: 10, textAlign: "right" },
  barsColumn: { flex: 1, flexDirection: "row", alignItems: "flex-end", gap: 6 },
  emptyBar: { flex: 1, minHeight: 6, borderRadius: 6, borderWidth: 1, borderStyle: "dashed" },
  bar: { flex: 1, minHeight: 6, borderRadius: 6 },
  hairline: { marginTop: 8, height: StyleSheet.hairlineWidth },
  eyebrowRow: { marginTop: 8, flexDirection: "row", justifyContent: "space-between" },
  eyebrowText: { fontFamily: fonts.bodySemiBold, fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase" },
  tapHint: { marginTop: 16, fontFamily: fonts.body, fontSize: 12 },
  feelingList: { marginTop: 16, gap: 10 },
  feelingRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  feelingLabel: { width: 100, fontFamily: fonts.bodySemiBold, fontSize: 14 },
  feelingBarTrack: { flex: 1 },
  feelingBarFill: { height: 8, minWidth: 6, borderRadius: 999 },
  feelingCount: { width: 24, textAlign: "right", fontFamily: fonts.bodySemiBold, fontSize: 12 },
});
