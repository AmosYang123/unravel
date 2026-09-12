import { useCallback, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link, useFocusEffect, useRouter } from "expo-router";
import { Lock } from "lucide-react-native";
import { PageTitle, PageUnderline, SectionLabel, Surface, withAlpha } from "@/components/ui";
import logoMark from "@/assets/logo-unravel.png";
import { entryPreview, modeGlyphColor, MODE_META } from "@/lib/content";
import { draftAge, draftHasContent, loadDraft } from "@/lib/drafts";
import type { EntryMode } from "@/lib/types";
import { useEntries, useSettings } from "@/lib/store";
import { useStyles, useTheme } from "@/theme/ThemeProvider";
import type { FontSet } from "@/theme/tokens";

const WAYS: EntryMode[] = ["longform", "voice", "bullets", "mood", "prompt", "short"];
const MORE: EntryMode[] = ["gratitude"];

const GAP_MS = 14 * 24 * 60 * 60 * 1000;

const greeting = () => {
  const h = new Date().getHours();
  if (h < 5) return "Still up";
  if (h < 12) return "Morning";
  if (h < 17) return "Afternoon";
  if (h < 22) return "Evening";
  return "Late tonight";
};

/**
 * Modes with something half-written waiting, most recently touched first.
 * Drafts live in AsyncStorage (see lib/drafts.ts), which has no synchronous
 * read on native, so this is awaited rather than computed inline like the
 * web version.
 */
const waitingDrafts = async (userId: string | null): Promise<EntryMode[]> => {
  const candidates = await Promise.all(
    [...WAYS, ...MORE].map(async (mode) => ({ mode, draft: await loadDraft(mode, userId) })),
  );
  return candidates
    .filter(({ draft }) => draft && draftHasContent(draft))
    // A draft from before timestamps existed has no age, so it sorts last.
    .map(({ mode, draft }) => ({ mode, age: (draft && draftAge(draft)) ?? Number.MAX_SAFE_INTEGER }))
    .sort((a, b) => a.age - b.age)
    .map(({ mode }) => mode);
};

export default function TodayScreen() {
  const { theme } = useTheme();
  const styles = useStyles(createStyles);
  const router = useRouter();
  const { settings } = useSettings();
  const { entries, entryCount, userId } = useEntries();
  const recent = entries.slice(0, 3);

  // Read once per visit: drafts only change from the compose screen.
  const [drafts, setDrafts] = useState<EntryMode[]>([]);
  useFocusEffect(useCallback(() => {
    let cancelled = false;
    waitingDrafts(userId).then((found) => {
      if (!cancelled) setDrafts(found);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]));
  const waiting = drafts[0];

  const newest = entries[0];
  const beenAWhile = !!newest && Date.now() - new Date(newest.createdAt).getTime() > GAP_MS;

  const goToMode = (mode: EntryMode) => router.push(`/write?mode=${mode}`);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.brandRow}>
          {/* Web tints this PNG with a CSS mask so it always reads as the theme's
              primary colour; RN has no CSS mask, so this leans on Image's built-in
              tintColor prop instead — same "recolour every opaque pixel" effect,
              no extra dependency. */}
          <Image
            source={logoMark}
            resizeMode="contain"
            tintColor={theme.colors.primary}
            accessibilityLabel="Unravel logo: a ball of yarn with one thread unraveling"
            style={styles.brandMark}
          />
          <Text style={[styles.brandWordmark, { color: theme.colors.foreground }]}>Unravel</Text>
        </View>

        <Text style={[styles.greeting, { color: theme.colors.mutedForeground }]}>
          {greeting()}
          {settings.name ? `, ${settings.name}` : ""}
        </Text>
        <PageTitle style={styles.title}>How do you want to check in?</PageTitle>
        <PageUnderline style={styles.underline} />
        <Text style={[styles.lede, { color: theme.colors.mutedForeground }]}>
          <Text style={[styles.ledeMark, { color: theme.colors.foreground }]}>
            Thirty seconds is a real check-in.
          </Text>{" "}
          So is thirty minutes. Nothing here counts days or keeps score.
        </Text>

        {beenAWhile && (
          <Text style={[styles.note, { color: theme.colors.mutedForeground }]}>
            Been a while. Nothing's changed here.
          </Text>
        )}

        {waiting && (
          <Pressable onPress={() => goToMode(waiting)} hitSlop={6}>
            <Text style={[styles.draftLink, { color: theme.colors.mutedForeground }]}>
              You left something in {MODE_META[waiting].label}
            </Text>
          </Pressable>
        )}

        <View style={styles.grid}>
          {WAYS.map((mode) => {
            const meta = MODE_META[mode];
            const Icon = meta.icon;
            return (
              <Surface key={mode} onPress={() => goToMode(mode)} style={styles.card}>
                <View style={styles.cardRow}>
                  <View style={styles.cardText}>
                    <View style={styles.cardTitleRow}>
                      <Icon size={16} color={modeGlyphColor(mode, theme.colors.accent)} strokeWidth={1.75} />
                      <Text style={[styles.cardTitle, { color: theme.colors.foreground }]}>{meta.label}</Text>
                      {drafts.includes(mode) && (
                        <View
                          accessibilityLabel="unfinished"
                          style={[styles.draftDot, { backgroundColor: withAlpha(theme.colors.accent, 0.7) }]}
                        />
                      )}
                    </View>
                    <Text style={[styles.cardBlurb, { color: theme.colors.mutedForeground }]}>{meta.blurb}</Text>
                  </View>
                  <View
                    style={[
                      styles.minutesBadge,
                      { borderColor: withAlpha(theme.colors.border, 0.7), backgroundColor: theme.colors.secondary },
                    ]}
                  >
                    <Text style={[styles.minutesText, { color: theme.colors.secondaryForeground }]}>
                      {meta.minutes}
                    </Text>
                  </View>
                </View>
              </Surface>
            );
          })}
        </View>

        <View style={styles.section}>
          <SectionLabel>Something softer</SectionLabel>
          <View style={[styles.softGrid, MORE.length === 1 && styles.softGridSingle]}>
            {MORE.map((mode) => {
              const meta = MODE_META[mode];
              const Icon = meta.icon;
              return (
                <Pressable
                  key={mode}
                  onPress={() => goToMode(mode)}
                  style={[
                    styles.softCard,
                    MORE.length === 1 && styles.softCardFull,
                    { borderColor: withAlpha(theme.colors.border, 0.7), backgroundColor: theme.colors.secondary },
                  ]}
                >
                  <View style={styles.cardTitleRow}>
                    <Icon size={16} color={modeGlyphColor(mode, theme.colors.accent)} strokeWidth={1.75} />
                    <Text style={[styles.softCardTitle, { color: theme.colors.foreground }]}>{meta.label}</Text>
                    {drafts.includes(mode) && (
                      <View
                        accessibilityLabel="unfinished"
                        style={[styles.draftDot, { backgroundColor: withAlpha(theme.colors.accent, 0.7) }]}
                      />
                    )}
                  </View>
                  <Text style={[styles.softCardMinutes, { color: theme.colors.mutedForeground }]}>
                    {meta.minutes}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={[styles.softGrid, styles.section]}>
          <Link href="/breathe" asChild>
            <Pressable
              style={StyleSheet.flatten([
                styles.softCard,
                { borderColor: withAlpha(theme.colors.border, 0.7), backgroundColor: theme.colors.secondary },
              ])}
            >
              <Text style={[styles.softCardTitle, { color: theme.colors.foreground }]}>Just breathe</Text>
              <Text style={[styles.softCardMinutes, { color: theme.colors.mutedForeground }]}>No entry needed</Text>
            </Pressable>
          </Link>
          <Link href="/history" asChild>
            <Pressable
              style={StyleSheet.flatten([
                styles.softCard,
                { borderColor: withAlpha(theme.colors.border, 0.7), backgroundColor: theme.colors.secondary },
              ])}
            >
              <Text style={[styles.softCardTitle, { color: theme.colors.foreground }]}>Read something old</Text>
              <Text style={[styles.softCardMinutes, { color: theme.colors.mutedForeground }]}>
                {entryCount} saved
              </Text>
            </Pressable>
          </Link>
        </View>

        {recent.length > 0 && (
          <View style={styles.section}>
            <SectionLabel>Recent</SectionLabel>
            <View style={[styles.recentList, { borderColor: withAlpha(theme.colors.border, 0.6) }]}>
              {recent.map((entry) => (
                <Link key={entry.id} href={`/entry/${entry.id}`} asChild>
                  <Pressable
                    style={StyleSheet.flatten([styles.recentRow, { borderColor: withAlpha(theme.colors.border, 0.6) }])}
                  >
                    <Text style={[styles.recentDate, { color: theme.colors.mutedForeground }]}>
                      {new Date(entry.createdAt).toLocaleDateString(undefined, {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                    </Text>
                    <Text
                      style={[styles.recentPreview, { color: theme.colors.foreground }]}
                      numberOfLines={2}
                    >
                      {entryPreview(entry)}
                    </Text>
                  </Pressable>
                </Link>
              ))}
            </View>
          </View>
        )}

        <View style={styles.privacy}>
          <Lock size={12} color={theme.colors.mutedForeground} strokeWidth={1.75} />
          <Text style={[styles.privacyText, { color: theme.colors.mutedForeground }]}>
            Saved to your account only. Nobody else can read it.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (fonts: FontSet) => StyleSheet.create({
  safe: { flex: 1 },
  scroll: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 40 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandMark: { width: 32, height: 32, aspectRatio: 459 / 651 },
  brandWordmark: { fontFamily: fonts.display, fontSize: 22, letterSpacing: -0.5 },
  greeting: { marginTop: 18, fontFamily: fonts.body, fontSize: 13 },
  title: { marginTop: 8 },
  underline: { marginTop: 12 },
  lede: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, marginTop: 14, maxWidth: 420 },
  ledeMark: { fontFamily: fonts.bodySemiBold },
  note: { fontFamily: fonts.body, fontSize: 13, marginTop: 16 },
  draftLink: { fontFamily: fonts.body, fontSize: 13, marginTop: 16, textDecorationLine: "underline" },
  grid: { marginTop: 32, gap: 10 },
  card: { padding: 18 },
  cardRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 14 },
  cardText: { flex: 1, minWidth: 0 },
  cardTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardTitle: { fontFamily: fonts.display, fontSize: 18 },
  cardBlurb: { fontFamily: fonts.body, fontSize: 13, marginTop: 4 },
  draftDot: { width: 6, height: 6, borderRadius: 3 },
  minutesBadge: { borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 5 },
  minutesText: { fontFamily: fonts.bodySemiBold, fontSize: 12 },
  section: { marginTop: 28 },
  softGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 14 },
  softGridSingle: { flexDirection: "column" },
  softCard: { flexBasis: "48%", flexGrow: 1, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, padding: 14 },
  // flexBasis is measured along the main axis, which softGridSingle flips to
  // column — so "100%" there would mean height, not width. width + alignSelf
  // keep this full-bleed regardless of the parent's flexDirection.
  softCardFull: { width: "100%", alignSelf: "stretch" },
  softCardTitle: { fontFamily: fonts.body, fontSize: 15 },
  softCardMinutes: { fontFamily: fonts.body, fontSize: 12, marginTop: 4 },
  recentList: { marginTop: 14, borderTopWidth: StyleSheet.hairlineWidth },
  recentRow: { paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  recentDate: { fontFamily: fonts.body, fontSize: 12 },
  recentPreview: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, marginTop: 4 },
  privacy: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 40 },
  privacyText: { fontFamily: fonts.body, fontSize: 12 },
});
