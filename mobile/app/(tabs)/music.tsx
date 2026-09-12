import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { Button, Chip, PageTitle, PageUnderline } from "@/components/ui";
import { GENRES } from "@/lib/content";
import { currentSettings, useSettings } from "@/lib/store";
import { applyTagOutcomes, keepOutcomesFor, replaceTag, resolveTags, splitTagInput, tagAction, tagNotice, type TagOutcome } from "@/lib/tags";
import { useStyles, useTheme } from "@/theme/ThemeProvider";
import type { FontSet } from "@/theme/tokens";

export default function MusicScreen() {
  const { theme } = useTheme();
  const styles = useStyles(createStyles);
  const { settings, update } = useSettings();
  const router = useRouter();
  const [artistDraft, setArtistDraft] = useState("");
  const [checking, setChecking] = useState(false);
  const [notices, setNotices] = useState<TagOutcome[]>([]);

  const toggleTaste = (genre: string) => void update({
    musicTastes: settings.musicTastes.includes(genre)
      ? settings.musicTastes.filter((item) => item !== genre)
      : [...settings.musicTastes, genre],
  });

  const addArtists = async () => {
    const raw = artistDraft;
    const terms = splitTagInput(raw);
    const added = terms.filter((term) => !settings.musicArtists.some((artist) => artist.toLowerCase() === term.toLowerCase()));
    if (!added.length) return;
    setArtistDraft("");
    setNotices([]);
    setChecking(true);
    try {
      await update({ musicArtists: [...settings.musicArtists, ...added] });
      const outcomes = keepOutcomesFor(terms, added, await resolveTags("artist", raw, settings.aiSuggestionsEnabled));
      await update({ musicArtists: applyTagOutcomes(currentSettings().musicArtists, added, outcomes) });
      setNotices(outcomes.filter((outcome) => outcome.status !== "kept"));
    } finally {
      setChecking(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back to settings" style={styles.back}>
          <ChevronLeft color={theme.colors.mutedForeground} size={18} />
          <Text style={[styles.backText, { color: theme.colors.mutedForeground }]}>Settings</Text>
        </Pressable>
        <PageTitle>Music</PageTitle>
        <PageUnderline style={styles.underline} />
        <Text style={[styles.intro, { color: theme.colors.mutedForeground }]}>Tell Unravel what you listen to so song suggestions fit you better. Everything here is optional.</Text>
        <Text style={[styles.heading, { color: theme.colors.foreground }]}>Genres you enjoy</Text>
        <View style={styles.chips}>{GENRES.map((genre) => <Chip key={genre} label={genre} selected={settings.musicTastes.includes(genre)} onPress={() => toggleTaste(genre)} />)}</View>
        <Text style={[styles.heading, { color: theme.colors.foreground }]}>Artists you listen to</Text>
        <Text style={[styles.helper, { color: theme.colors.mutedForeground }]}>Add one or several names. Song suggestions will lean toward them when they suit your journal entry.</Text>
        <View style={styles.addRow}>
          <TextInput value={artistDraft} onChangeText={setArtistDraft} onSubmitEditing={() => void addArtists()} placeholder="e.g. Frank Ocean" placeholderTextColor={theme.colors.mutedForeground} returnKeyType="done" style={[styles.input, { color: theme.colors.foreground, backgroundColor: theme.colors.card, borderColor: theme.colors.border }]} />
          <Button label="Add" variant="ghost" disabled={!artistDraft.trim() || checking} onPress={() => void addArtists()} />
        </View>
        {checking && <Text style={[styles.helper, { color: theme.colors.mutedForeground }]}>Checking the spelling…</Text>}
        {notices.map((outcome) => {
          const action = tagAction(outcome);
          return <View key={outcome.original} style={styles.notice}><Text style={[styles.helper, { color: theme.colors.mutedForeground }]}>{tagNotice(outcome)}</Text>{action && <Pressable onPress={() => { void update({ musicArtists: replaceTag(currentSettings().musicArtists, outcome.value, action.value) }); setNotices((items) => items.filter((item) => item !== outcome)); }}><Text style={{ color: theme.colors.foreground }}>{action.label}</Text></Pressable>}</View>;
        })}
        <View style={styles.chips}>{settings.musicArtists.map((artist) => <Chip key={artist} label={artist} selected accessibilityLabel={`Remove ${artist}`} onPress={() => void update({ musicArtists: settings.musicArtists.filter((item) => item !== artist) })} />)}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (fonts: FontSet) => StyleSheet.create({
  safe: { flex: 1 }, content: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 48 }, underline: { marginTop: 12 },
  back: { minHeight: 44, flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 4 }, backText: { fontFamily: fonts.body, fontSize: 14 },
  intro: { marginTop: 24, fontFamily: fonts.body, fontSize: 14, lineHeight: 21 }, heading: { marginTop: 28, fontFamily: fonts.display, fontSize: 19 },
  helper: { marginTop: 6, fontFamily: fonts.body, fontSize: 13, lineHeight: 19 }, chips: { marginTop: 14, flexDirection: "row", flexWrap: "wrap", gap: 8 },
  addRow: { marginTop: 14, flexDirection: "row", alignItems: "center", gap: 8 }, input: { flex: 1, height: 46, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, fontFamily: fonts.body, fontSize: 15 },
  notice: { marginTop: 10, gap: 4 },
});
