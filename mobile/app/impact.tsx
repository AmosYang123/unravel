import { useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link } from "expo-router";
import { ArrowLeft, Loader2, Lock, TriangleAlert } from "lucide-react-native";
import { Eyebrow, PageTitle, PageUnderline, SectionLabel, Surface, withAlpha } from "@/components/ui";
import { supabase } from "@/integrations/supabase/client";
import { useStyles, useTheme } from "@/theme/ThemeProvider";
import type { FontSet } from "@/theme/tokens";

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

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

/** week is a date-only string (YYYY-MM-DD); parse as local so the label
    doesn't shift a day at negative UTC offsets. */
const weekLabel = (week: string) => {
  const parts = week.split("-").map(Number);
  const [y, m, d] = [parts[0] ?? 1970, parts[1] ?? 1, parts[2] ?? 1];
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

/** Ported from src/pages/Impact.tsx. Admin-only; fails closed for everyone else. */
export default function ImpactScreen() {
  const { theme } = useTheme();
  const styles = useStyles(createStyles);
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

  const header = (
    <View>
      <Link href="/" dismissTo asChild>
        <Pressable style={styles.backLink} accessibilityRole="link" hitSlop={6}>
          <ArrowLeft color={theme.colors.mutedForeground} size={16} strokeWidth={1.5} />
          <Text style={[styles.backLabel, { color: theme.colors.mutedForeground }]}>Back</Text>
        </Pressable>
      </Link>

      <PageTitle style={styles.heading}>Impact</PageTitle>
      <PageUnderline style={styles.underline} />
      <Text style={[styles.lede, { color: theme.colors.mutedForeground }]}>
        Aggregate mood and energy only. No entry text, voice memos, names, or emails are ever readable here — not
        even for you.
      </Text>

      {loading && (
        <View style={styles.statusRow}>
          <Loader2 color={theme.colors.mutedForeground} size={16} />
          <Text style={[styles.statusText, { color: theme.colors.mutedForeground }]}>Reading the numbers…</Text>
        </View>
      )}

      {!loading && denied && (
        <View style={styles.statusRow}>
          <Lock color={theme.colors.mutedForeground} size={14} strokeWidth={1.5} />
          <Text style={[styles.statusText, { color: theme.colors.mutedForeground }]}>
            This page is limited to the app owner.
          </Text>
          <Link href="/" dismissTo asChild>
            <Pressable hitSlop={6}>
              <Text style={[styles.statusLink, { color: theme.colors.foreground }]}>Back home</Text>
            </Pressable>
          </Link>
        </View>
      )}

      {!loading && loadError && (
        <View style={styles.statusRow}>
          <TriangleAlert color={theme.colors.mutedForeground} size={14} strokeWidth={1.5} />
          <Text style={[styles.statusText, { color: theme.colors.mutedForeground }]}>
            The numbers didn't load. Try refreshing.
          </Text>
        </View>
      )}

      {!loading && !denied && !loadError && (
        <View>
          <View style={styles.tileGrid}>
            {[
              { label: "Check-ins", value: String(overview?.total_entries ?? 0) },
              { label: "People", value: String(overview?.total_people ?? 0) },
              { label: "Avg mood", value: num(overview?.avg_mood) },
              { label: "Avg energy", value: num(overview?.avg_energy) },
            ].map((s) => (
              <Surface key={s.label} style={styles.tile}>
                <Text style={[styles.tileValue, { color: theme.colors.foreground }]}>{s.value}</Text>
                <Text style={[styles.tileLabel, { color: theme.colors.mutedForeground }]}>{s.label}</Text>
              </Surface>
            ))}
          </View>

          <View style={styles.section}>
            <SectionLabel>Week by week</SectionLabel>
            {weekly.length === 0 ? (
              <Text style={[styles.note, { color: theme.colors.mutedForeground }]}>Nothing recorded yet.</Text>
            ) : (
              <View style={[styles.weekList, { borderColor: withAlpha(theme.colors.border, 0.7) }]}>
                {weekly.map((w) => (
                  <View
                    key={w.week}
                    style={[styles.weekRow, { borderColor: withAlpha(theme.colors.border, 0.7) }]}
                  >
                    <Text style={[styles.weekDate, { color: theme.colors.mutedForeground }]}>
                      {weekLabel(w.week)}
                    </Text>
                    <View
                      style={[
                        styles.weekBar,
                        {
                          width: `${(w.entries / maxEntries) * 45}%`,
                          backgroundColor: withAlpha(theme.colors.accent, 0.5),
                        },
                      ]}
                    />
                    <Text style={[styles.weekStats, { color: theme.colors.mutedForeground }]}>
                      {w.entries} check-ins · mood {num(w.avg_mood)} · energy {num(w.avg_energy)}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          <View style={styles.section}>
            <Eyebrow>First entries vs. most recent</Eyebrow>
            <Text style={[styles.paragraph, { color: theme.colors.mutedForeground }]}>
              Each row is one anonymous person, shown only as a code. Averages compare their first three check-ins
              to their last three.
            </Text>
            {trajectory.length === 0 && (
              <Text style={[styles.note, { color: theme.colors.mutedForeground }]}>Nothing recorded yet.</Text>
            )}
          </View>
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]} edges={["top"]}>
      <FlatList
        data={!loading && !denied && !loadError ? trajectory : []}
        keyExtractor={(t) => t.person_code}
        contentContainerStyle={styles.scroll}
        ListHeaderComponent={header}
        renderItem={({ item: t }) => {
          const dMood = delta(t.early_avg_mood, t.recent_avg_mood);
          const dEnergy = delta(t.early_avg_energy, t.recent_avg_energy);
          return (
            <View style={[styles.trajectoryRow, { borderColor: withAlpha(theme.colors.border, 0.7) }]}>
              <Text style={[styles.personCode, { color: theme.colors.mutedForeground }]}>{t.person_code}</Text>
              <Text style={[styles.trajectoryLine, { color: theme.colors.foreground }]}>
                Mood {num(t.early_avg_mood)} → {num(t.recent_avg_mood)}
                {dMood != null && (
                  <Text style={{ color: theme.colors.mutedForeground }}>
                    {" "}
                    ({dMood >= 0 ? "+" : ""}
                    {dMood.toFixed(1)})
                  </Text>
                )}
                {" · "}
                Energy {num(t.early_avg_energy)} → {num(t.recent_avg_energy)}
                {dEnergy != null && (
                  <Text style={{ color: theme.colors.mutedForeground }}>
                    {" "}
                    ({dEnergy >= 0 ? "+" : ""}
                    {dEnergy.toFixed(1)})
                  </Text>
                )}
              </Text>
              <Text style={[styles.trajectoryMeta, { color: theme.colors.mutedForeground }]}>
                {t.entries} check-ins · {shortDate(t.first_entry_at)} – {shortDate(t.last_entry_at)}
              </Text>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const createStyles = (fonts: FontSet) => StyleSheet.create({
  safe: { flex: 1 },
  scroll: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 56 },
  backLink: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44 },
  backLabel: { fontFamily: fonts.body, fontSize: 14 },
  heading: { marginTop: 20 },
  underline: { marginTop: 10 },
  lede: { marginTop: 16, maxWidth: 420, fontFamily: fonts.body, fontSize: 14, lineHeight: 21 },
  statusRow: { marginTop: 28, flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  statusText: { fontFamily: fonts.body, fontSize: 13 },
  statusLink: { fontFamily: fonts.body, fontSize: 13, textDecorationLine: "underline" },
  tileGrid: { marginTop: 28, flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: { width: "47%", padding: 14 },
  tileValue: { fontFamily: fonts.display, fontSize: 24 },
  tileLabel: { marginTop: 4, fontFamily: fonts.body, fontSize: 12 },
  section: { marginTop: 32 },
  note: { marginTop: 14, fontFamily: fonts.body, fontSize: 13 },
  paragraph: { marginTop: 8, fontFamily: fonts.body, fontSize: 13, lineHeight: 19 },
  weekList: { marginTop: 14, borderTopWidth: StyleSheet.hairlineWidth },
  weekRow: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, gap: 6 },
  weekDate: { fontFamily: fonts.body, fontSize: 12 },
  weekBar: { height: 6, borderRadius: 999, minWidth: 4 },
  weekStats: { fontFamily: fonts.body, fontSize: 12 },
  trajectoryRow: { paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  personCode: { fontFamily: fonts.body, fontSize: 11 },
  trajectoryLine: { marginTop: 4, fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  trajectoryMeta: { marginTop: 4, fontFamily: fonts.body, fontSize: 12 },
});
