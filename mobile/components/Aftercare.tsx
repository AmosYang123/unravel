import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Link, useRouter } from "expo-router";
import { Check, Compass, Music, RefreshCw, Shuffle, Wind, type LucideIcon } from "lucide-react-native";
import { AudioPlayer, Button, Surface, withAlpha } from "@/components/ui";
import BreathingSession from "@/components/BreathingSession";
import { useStyles, useTheme } from "@/theme/ThemeProvider";
import type { FontSet } from "@/theme/tokens";
import { entryText, supportPlan, type SupportPlan } from "@/lib/content";
import { fetchEntryAdvice } from "@/lib/advice";
import { fetchSongSuggestions, type SongSuggestions } from "@/lib/music";
import type { Entry, Settings } from "@/lib/types";
import { useEntries, useSettings } from "@/lib/store";

type Panel = "music" | "breathe" | "plan" | null;
type PanelKey = Exclude<Panel, null>;

/** One request a panel is waiting on. `warm` means a save-time request may already cover it. */
interface Ask {
  seed: number;
  warm?: boolean;
}

type Persist = (id: string, patch: Partial<Entry>) => Promise<void>;

const newSongSeed = () => Math.floor(Math.random() * 997);

/**
 * Save-time requests, kept by entry id so a panel opened seconds later waits on
 * the answer already coming instead of asking for a different one. A request
 * that fails is dropped, which leaves the panel free to try for itself.
 */
const warmSongs = new Map<string, Promise<SongSuggestions>>();
const warmPlans = new Map<string, Promise<SupportPlan>>();

/** Writing the aftercare back is best effort; the panel still shows what came back. */
const keepOnEntry = (persist: Persist, id: string, patch: Partial<Entry>) => {
  void persist(id, patch).catch((err: unknown) => {
    console.error("Couldn't store the aftercare on this entry:", err);
  });
};

/**
 * Starts the song and advice requests the moment an entry is saved and writes
 * what comes back onto the entry. Failures stay quiet here — the panels keep
 * their own loading and error states for whoever opens them.
 *
 * Nothing at all happens when suggestions are off: the gate lives here rather
 * than at the call site so no caller can forget it.
 */
export function warmAftercare(entry: Entry, settings: Settings, persist: Persist) {
  if (!settings.aiSuggestionsEnabled) return;

  if (!warmSongs.has(entry.id)) {
    const songs = fetchSongSuggestions(entry, settings, newSongSeed()).then((res) => {
      keepOnEntry(persist, entry.id, { songs: res });
      return res;
    });
    songs.catch(() => warmSongs.delete(entry.id));
    warmSongs.set(entry.id, songs);
  }

  if (!warmPlans.has(entry.id)) {
    const plan = fetchEntryAdvice(entry, 0, (result) =>
      keepOnEntry(persist, entry.id, {
        transcript: result.transcript,
        transcriptSummary: result.summary ?? undefined,
        transcriptStatus: "done",
      }),
    ).then((p) => {
      keepOnEntry(persist, entry.id, { advice: p });
      return p;
    });
    plan.catch(() => warmPlans.delete(entry.id));
    warmPlans.set(entry.id, plan);
  }
}

/** Shown in place of anything fetched, so the setting's effect is never a mystery. */
function SuggestionsOff() {
  const { theme } = useTheme();
  const styles = useStyles(createStyles);
  return (
    <Text style={[styles.body, { color: theme.colors.mutedForeground }]}>
      Suggestions are off, so nothing about this entry was sent anywhere. Turn them back on in{" "}
      <Link href="/settings" style={[styles.link, { color: theme.colors.mutedForeground }]}>
        Settings
      </Link>
      <Text>.</Text>
    </Text>
  );
}

const OPTIONS: Record<PanelKey, { label: string; icon: LucideIcon }> = {
  music: { label: "Song options", icon: Music },
  breathe: { label: "Meditation", icon: Wind },
  plan: { label: "AI advice & encouragement", icon: Compass },
};

/** Barely a paragraph, and a real sit-down. */
const SHORT_ENTRY = 140;
const LONG_ENTRY = 600;

/** Which door the entry itself asks for. Nothing on screen explains the order. */
const orderByEntry = (entry: Entry): PanelKey[] => {
  const written = entryText(entry).trim().length;
  const flat = entry.mood === 3 && entry.feelings.length === 0;
  if (written < SHORT_ENTRY && flat) return ["breathe", "plan", "music"];
  if (written > LONG_ENTRY || entry.mood <= 2) return ["plan", "music", "breathe"];
  if (entry.mood >= 4) return ["music", "plan", "breathe"];
  return ["music", "breathe", "plan"];
};

/**
 * What each onboarding goal asks to be offered first (ids from GOALS in
 * lib/onboarding.ts). "keep a record" is absent on purpose: it says nothing
 * about aftercare, so it leaves the entry's own order alone. The list is
 * ordered, so someone who picked two goals gets a settled answer rather than
 * whichever happened to be stored first.
 */
const GOAL_PANEL: { goal: string; panel: PanelKey }[] = [
  { goal: "calm", panel: "breathe" },
  { goal: "patterns", panel: "plan" },
  { goal: "vent", panel: "music" },
];

/** The entry's own order, with a stated goal's door pulled to the front of it. */
const orderPanels = (entry: Entry, goals: string[]): PanelKey[] => {
  const order = orderByEntry(entry);
  const wanted = GOAL_PANEL.find((g) => goals.includes(g.goal))?.panel;
  return wanted ? [wanted, ...order.filter((key) => key !== wanted)] : order;
};

/**
 * Ported from src/components/Aftercare.tsx. Same fetch/persist/ordering
 * behaviour and the same privacy gate; only the presentation is native.
 */
const Aftercare = ({ entry, revisit }: { entry: Entry; revisit?: boolean }) => {
  const { theme } = useTheme();
  const styles = useStyles(createStyles);
  const router = useRouter();
  const { settings } = useSettings();
  const { updateEntry } = useEntries();

  const [panel, setPanel] = useState<Panel>(null);
  // Both the songs and the advice describe this entry to a service, so both wait
  // on the same permission. Stored aftercare still shows: it is already here.
  const suggestionsOn = settings.aiSuggestionsEnabled;
  // Fixed when the aftercare opens, so the buttons never rearrange under a
  // finger as a transcript or a plan lands.
  const [options] = useState(() => orderPanels(entry, settings.goals).map((key) => ({ key, ...OPTIONS[key] })));

  const [songAsk, setSongAsk] = useState<Ask | null>(null);
  const [songs, setSongs] = useState<SongSuggestions | null>(null);
  const [songsLoading, setSongsLoading] = useState(false);
  const [songsError, setSongsError] = useState<string | null>(null);
  // What this entry was already given stands until a fetch here replaces it.
  const shownSongs = songs ?? entry.songs ?? null;

  const [planAsk, setPlanAsk] = useState<Ask | null>(null);
  const [plan, setPlan] = useState<SupportPlan | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const shownPlan = plan ?? entry.advice ?? null;

  const entryRef = useRef(entry);

  useEffect(() => {
    entryRef.current = entry;
  }, [entry]);

  const needsTranscript = entry.mode === "voice" && !entry.transcript && !!entry.audioPath;

  useEffect(() => {
    if (!songAsk || !settings.aiSuggestionsEnabled) return;
    let cancelled = false;
    const target = entryRef.current;
    setSongsLoading(true);
    setSongsError(null);
    const pending = songAsk.warm ? warmSongs.get(target.id) : undefined;
    const request =
      pending ??
      fetchSongSuggestions(target, settings, songAsk.seed).then((res) => {
        keepOnEntry(updateEntry, target.id, { songs: res });
        return res;
      });

    request
      .then((res) => {
        if (!cancelled) setSongs(res);
      })
      .catch((err: unknown) => {
        console.error("fetchSongSuggestions failed:", err);
        if (!cancelled) setSongsError("Couldn't find songs just now.");
      })
      .finally(() => {
        if (!cancelled) setSongsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [songAsk]);

  useEffect(() => {
    if (!planAsk || !settings.aiSuggestionsEnabled) return;
    let cancelled = false;
    const target = entryRef.current;
    setPlanLoading(true);
    setPlanError(null);
    const pending = planAsk.warm ? warmPlans.get(target.id) : undefined;
    const request =
      pending ??
      fetchEntryAdvice(target, planAsk.seed, (result) =>
        keepOnEntry(updateEntry, target.id, {
          transcript: result.transcript,
          transcriptSummary: result.summary ?? undefined,
          transcriptStatus: "done",
        }),
      ).then((p) => {
        keepOnEntry(updateEntry, target.id, { advice: p });
        return p;
      });

    request
      .then((p) => {
        if (!cancelled) setPlan(p);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error("fetchEntryAdvice failed:", err);
        setPlanError("Couldn't reach the advice service just now.");
        const local = supportPlan(target, planAsk.seed);
        const offline = { ...local, basis: `Written on-device from this entry (${local.basis})` };
        setPlan(offline);
        // Kept too: what you were given has to be what you find later.
        keepOnEntry(updateEntry, target.id, { advice: offline });
      })
      .finally(() => {
        if (!cancelled) setPlanLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [planAsk]);

  const openPanel = (key: PanelKey) => {
    const next = panel === key ? null : key;
    setPanel(next);
    // Only ask for what this entry hasn't already been given, and only if asking is allowed.
    if (!suggestionsOn) return;
    if (next === "music" && !shownSongs && !songAsk) setSongAsk({ seed: newSongSeed(), warm: true });
    if (next === "plan" && !shownPlan && !planAsk) setPlanAsk({ seed: 0, warm: true });
  };

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      {!revisit && (
        <View style={styles.savedRow}>
          <Check color={theme.colors.mutedForeground} size={16} strokeWidth={1.5} />
          <Text style={[styles.savedLabel, { color: theme.colors.mutedForeground }]}>Saved, privately.</Text>
        </View>
      )}
      <Text style={[styles.heading, { color: theme.colors.foreground }]}>
        {revisit ? "Anything for this entry?" : "What would help right now?"}
      </Text>
      <Text style={[styles.body, styles.lede, { color: theme.colors.mutedForeground }]}>
        All optional. The check-in already counted.
      </Text>

      <View style={styles.options}>
        {options.map(({ key, label, icon: Icon }) => {
          const active = panel === key;
          return (
            <Pressable
              key={key}
              onPress={() => openPanel(key)}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={{ selected: active }}
              style={[
                styles.optionButton,
                {
                  borderColor: active ? theme.colors.accent : withAlpha(theme.colors.border, 0.7),
                  backgroundColor: active ? withAlpha(theme.colors.accent, 0.1) : "transparent",
                },
              ]}
            >
              <Icon color={theme.colors.foreground} size={16} strokeWidth={1.5} />
              <Text style={[styles.optionLabel, { color: theme.colors.foreground }]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      {panel === "music" && (
        <Surface style={styles.panel}>
          {suggestionsOn ? (
            <Text style={[styles.body, { color: theme.colors.mutedForeground }]}>
              {settings.musicArtists.length || settings.musicTastes.length
                ? `Pulled live from your taste — ${[...settings.musicTastes, ...settings.musicArtists].slice(0, 4).join(", ")}${[...settings.musicTastes, ...settings.musicArtists].length > 4 ? "…" : ""} — and matched to this entry.`
                : "Pulled live and matched to this entry."}
            </Text>
          ) : (
            <SuggestionsOff />
          )}

          {songsLoading && !shownSongs && (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={theme.colors.mutedForeground} size="small" />
              <Text style={[styles.body, { color: theme.colors.mutedForeground }]}>
                Looking for something that fits…
              </Text>
            </View>
          )}

          {songsError && !songsLoading && !shownSongs && (
            <View style={styles.retryBlock}>
              <Text style={[styles.body, { color: theme.colors.mutedForeground }]}>{songsError}</Text>
              <Pressable
                onPress={() => setSongAsk((a) => ({ seed: (a?.seed ?? newSongSeed()) + 1 }))}
                style={styles.inlineAction}
                accessibilityRole="button"
                accessibilityLabel="Try again"
              >
                <RefreshCw color={theme.colors.mutedForeground} size={14} strokeWidth={1.5} />
                <Text style={[styles.inlineActionLabel, { color: theme.colors.mutedForeground }]}>Try again</Text>
              </Pressable>
            </View>
          )}

          {shownSongs && (
            <View style={styles.songList}>
              {shownSongs.picks.map((song, i) => (
                <View
                  key={song.id}
                  style={[
                    styles.songRow,
                    i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: withAlpha(theme.colors.border, 0.7) },
                  ]}
                >
                  {song.albumArt ? <Image source={{ uri: song.albumArt }} style={styles.albumArt} /> : null}
                  <View style={styles.songInfo}>
                    {song.url ? (
                      <Pressable onPress={() => void Linking.openURL(song.url!)} accessibilityRole="link">
                        <Text style={[styles.link, styles.songTitle, { color: theme.colors.foreground }]}>
                          {song.title}
                        </Text>
                      </Pressable>
                    ) : (
                      <Text style={[styles.songTitle, { color: theme.colors.foreground }]}>{song.title}</Text>
                    )}
                    <Text style={[styles.body, { color: theme.colors.mutedForeground }]}>
                      {song.artist}
                      {song.genre ? ` · ${song.genre}` : ""}
                    </Text>
                    {Boolean(song.note) && <Text style={[styles.body, styles.songNote, { color: theme.colors.foreground }]}>{song.note}</Text>}
                    <Text style={[styles.songReason, { color: theme.colors.mutedForeground }]}>Why this: {song.reason}</Text>
                    {Boolean(song.previewUrl) && (
                      <View style={styles.songPreview}>
                        <AudioPlayer uri={song.previewUrl} label={`preview of ${song.title}`} />
                      </View>
                    )}
                  </View>
                </View>
              ))}
              <Text style={[styles.songSource, { color: theme.colors.mutedForeground }]}>
                {shownSongs.source === "deezer"
                  ? `From Deezer · ${shownSongs.basis}`
                  : "Live picks couldn't answer just now, so these come from the built-in list."}
              </Text>
            </View>
          )}

          {suggestionsOn && (
            <View style={styles.panelFooter}>
              <Pressable
                onPress={() => setSongAsk((a) => ({ seed: (a?.seed ?? newSongSeed()) + 3 }))}
                disabled={songsLoading}
                style={[styles.inlineAction, songsLoading && { opacity: 0.5 }]}
                accessibilityRole="button"
                accessibilityLabel="Different songs"
              >
                <Shuffle color={theme.colors.mutedForeground} size={14} strokeWidth={1.5} />
                <Text style={[styles.inlineActionLabel, { color: theme.colors.mutedForeground }]}>Different songs</Text>
              </Pressable>
              {settings.musicArtists.length === 0 && (
                <Link href="/settings" style={[styles.link, { color: theme.colors.foreground }]}>
                  Add your most-listened artists
                </Link>
              )}
            </View>
          )}
        </Surface>
      )}

      {panel === "breathe" && (
        <Surface style={styles.panel}>
          <BreathingSession />
        </Surface>
      )}

      {panel === "plan" && (
        <Surface style={styles.panel}>
          {!suggestionsOn && (
            <View style={shownPlan ? styles.suggestionsOffWithPlan : undefined}>
              <SuggestionsOff />
            </View>
          )}

          {planLoading && !shownPlan && (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={theme.colors.mutedForeground} size="small" />
              <Text style={[styles.body, { color: theme.colors.mutedForeground }]}>
                {needsTranscript ? "Listening to your memo, then reading it…" : "Reading your entry…"}
              </Text>
            </View>
          )}

          {planError && (
            <Text style={[styles.body, styles.planErrorText, { color: theme.colors.mutedForeground }]}>
              {planError} Here's something written on-device instead.
            </Text>
          )}

          {shownPlan && (
            <View style={planLoading && styles.dimmed}>
              <Text style={[styles.planHeadline, { color: theme.colors.foreground }]}>{shownPlan.headline}</Text>
              <Text style={[styles.body, styles.planEncouragement, { color: theme.colors.foreground }]}>
                {shownPlan.encouragement}
              </Text>
              <View style={styles.stepsList}>
                {shownPlan.steps.map((step, i) => (
                  <View key={i} style={styles.stepRow}>
                    <Text style={[styles.body, { color: theme.colors.mutedForeground }]}>{i + 1}.</Text>
                    <Text style={[styles.body, styles.stepText, { color: theme.colors.foreground }]}>{step}</Text>
                  </View>
                ))}
              </View>
              {suggestionsOn && (
                <Pressable
                  onPress={() => setPlanAsk((a) => ({ seed: (a?.seed ?? 0) + 1 }))}
                  disabled={planLoading}
                  style={[styles.inlineAction, styles.planAction, planLoading && { opacity: 0.5 }]}
                  accessibilityRole="button"
                  accessibilityLabel="Different advice"
                >
                  <RefreshCw color={theme.colors.mutedForeground} size={14} strokeWidth={1.5} />
                  <Text style={[styles.inlineActionLabel, { color: theme.colors.mutedForeground }]}>Different advice</Text>
                </Pressable>
              )}
              <Text style={[styles.planBasis, { color: theme.colors.mutedForeground }]}>
                {shownPlan.basis}. What's sent is this entry itself — mood, energy, feelings, prompt, pre-writing
                answers, and its text or voice recording — never your name or anything else you've written. Turn this
                off any time in Settings.
              </Text>
            </View>
          )}
        </Surface>
      )}

      <View style={styles.footerActions}>
        <Button label="Nothing, I'm done" onPress={() => router.dismissTo("/")} />
        <Button variant="ghost" label="See the entry" onPress={() => router.push(`/entry/${entry.id}`)} />
      </View>
    </ScrollView>
  );
};

const createStyles = (fonts: FontSet) => StyleSheet.create({
  scroll: { paddingBottom: 48 },
  savedRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  savedLabel: { fontFamily: fonts.body, fontSize: 14 },
  heading: { marginTop: 16, fontFamily: fonts.display, fontSize: 26, lineHeight: 32 },
  body: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21 },
  lede: { marginTop: 12, maxWidth: 420 },
  link: { fontFamily: fonts.body, fontSize: 14, textDecorationLine: "underline" },
  options: { marginTop: 32, gap: 12 },
  optionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    padding: 16,
    minHeight: 44,
  },
  optionLabel: { flexShrink: 1, fontFamily: fonts.body, fontSize: 15 },
  panel: { marginTop: 24 },
  loadingRow: { marginTop: 16, flexDirection: "row", alignItems: "center", gap: 8 },
  retryBlock: { marginTop: 16, gap: 8, alignItems: "flex-start" },
  inlineAction: { flexDirection: "row", alignItems: "center", gap: 8 },
  inlineActionLabel: { fontFamily: fonts.body, fontSize: 14 },
  songList: { marginTop: 16, gap: 0 },
  songRow: { flexDirection: "row", gap: 16, paddingVertical: 12 },
  albumArt: { width: 56, height: 56, borderRadius: 12 },
  songInfo: { flex: 1, gap: 2 },
  songTitle: { fontFamily: fonts.display, fontSize: 17 },
  songNote: { marginTop: 4 },
  songReason: { marginTop: 4, fontFamily: fonts.body, fontSize: 12 },
  songPreview: { marginTop: 8, maxWidth: 220 },
  songSource: { marginTop: 12, fontFamily: fonts.body, fontSize: 12 },
  panelFooter: { marginTop: 16, flexDirection: "row", alignItems: "center", gap: 16, flexWrap: "wrap" },
  suggestionsOffWithPlan: { marginBottom: 16 },
  planErrorText: { marginBottom: 16 },
  dimmed: { opacity: 0.5 },
  planHeadline: { fontFamily: fonts.display, fontSize: 20 },
  planEncouragement: { marginTop: 12 },
  stepsList: { marginTop: 20, gap: 12 },
  stepRow: { flexDirection: "row", gap: 12 },
  stepText: { flex: 1 },
  planAction: { marginTop: 20 },
  planBasis: { marginTop: 16, fontFamily: fonts.body, fontSize: 12, lineHeight: 18 },
  footerActions: { marginTop: 40, flexDirection: "row", flexWrap: "wrap", gap: 12 },
});

export default Aftercare;
