import { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { File } from "expo-file-system";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ArrowLeft, Plus, Shuffle, X } from "lucide-react-native";
import { Button, ConfirmDialog, PageUnderline, toast, withAlpha } from "@/components/ui";
import CheckInSliders from "@/components/CheckInSliders";
import VoiceRecorder, { type Recording } from "@/components/VoiceRecorder";
import Aftercare, { warmAftercare } from "@/components/Aftercare";
import { MODE_META, MODE_SLIDERS, modeGlyphColor, PROMPTS } from "@/lib/content";
import { draftAge, draftHasContent, draftKey, loadDraft, type Draft } from "@/lib/drafts";
import type { Entry, EntryMode, NewEntry } from "@/lib/types";
import { uploadVoiceMemo, useEntries, useSettings } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { useStyles, useTheme } from "@/theme/ThemeProvider";
import type { FontSet } from "@/theme/tokens";

const isMode = (v: string | undefined): v is EntryMode =>
  !!v && Object.prototype.hasOwnProperty.call(MODE_META, v);

const STALE_DRAFT_MS = 3 * 24 * 60 * 60 * 1000;

/** Where each mode's sliders were left, kept apart from the draft itself. AsyncStorage
    has no synchronous read, so — unlike the web version's localStorage helpers — these
    are async. */
const sliderMemoryKey = (mode: EntryMode, userId: string | undefined) => `quiet.sliders.${userId}.${mode}.v2`;

const loadSliderMemory = async (mode: EntryMode, userId: string | undefined): Promise<Record<string, number>> => {
  try {
    const raw = await AsyncStorage.getItem(sliderMemoryKey(mode, userId));
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object") return {};
    const remembered: Record<string, number> = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "number" && value >= 1 && value <= 5) remembered[id] = Math.round(value);
    }
    return remembered;
  } catch {
    return {};
  }
};

const rememberSliders = async (mode: EntryMode, values: Record<string, number>, userId: string | undefined): Promise<void> => {
  try {
    await AsyncStorage.setItem(sliderMemoryKey(mode, userId), JSON.stringify(values));
  } catch {
    // ignore storage failures
  }
};

/** Ported from src/pages/Compose.tsx. */
export default function WriteScreen() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const mode: EntryMode = isMode(params.mode) ? params.mode : "short";
  // Remount the form whenever the mode changes so slider ids and any draft always match it.
  return <ComposeForm key={mode} mode={mode} />;
}

const ComposeForm = ({ mode }: { mode: EntryMode }) => {
  const { theme } = useTheme();
  const styles = useStyles(createStyles);
  const router = useRouter();
  const meta = MODE_META[mode];
  const Icon = meta.icon;
  const { entries, addEntry, updateEntry } = useEntries();
  const { settings } = useSettings();
  const { user } = useAuth();

  const specs = MODE_SLIDERS[mode] ?? [];

  const [ready, setReady] = useState(false);
  const [initialDraft, setInitialDraft] = useState<Draft | null>(null);

  const [sliders, setSliders] = useState<Record<string, number>>({});
  // True only while the carried-over values are still untouched.
  const [carried, setCarried] = useState(false);
  const [feelings, setFeelings] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [bullets, setBullets] = useState<string[]>([""]);
  const [gratitude, setGratitude] = useState<string[]>(["", "", ""]);
  const [audio, setAudio] = useState<{ recording?: Recording; seconds: number }>({ seconds: 0 });
  const [promptIndex, setPromptIndex] = useState(0);
  const [saved, setSaved] = useState<Entry | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [restedDraft, setRestedDraft] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const lastWritten = useRef<string | null>(null);

  // Loads the draft and any remembered slider positions once, before anything renders
  // with default values — there's no synchronous read on native the way localStorage
  // gave the web version.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [draft, remembered] = await Promise.all([loadDraft(mode, user?.id), loadSliderMemory(mode, user?.id)]);
      if (cancelled) return;
      setInitialDraft(draft);
      setSliders(Object.fromEntries(specs.map((s) => [s.id, draft?.sliders?.[s.id] ?? remembered[s.id] ?? 3])));
      setCarried(specs.some((s) => draft?.sliders?.[s.id] === undefined && remembered[s.id] !== undefined));
      setFeelings(draft?.feelings ?? []);
      setText(draft?.text ?? "");
      setTitle(draft?.title ?? "");
      setBullets(draft?.bullets ?? [""]);
      setGratitude(draft?.gratitude ?? ["", "", ""]);
      setPromptIndex(draft?.promptIndex ?? Math.floor(Math.random() * PROMPTS.length));
      // A draft nobody has come back to in days gets a line, never a nudge.
      const age = draft ? draftAge(draft) : null;
      setRestedDraft(!!draft && draftHasContent(draft) && age !== null && age > STALE_DRAFT_MS);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Autosave the draft (audio can't be serialized, so voice recordings aren't included).
  useEffect(() => {
    if (!ready) return;
    const draft: Draft = { sliders, feelings, text, title, bullets, gratitude, promptIndex };
    const body = JSON.stringify(draft);
    const previous = lastWritten.current;
    lastWritten.current = body;
    // Nothing changed, or the page just opened an existing draft — neither counts
    // as touching it, so the timestamp stays where it was.
    if (body === previous) return;
    if (previous === null && initialDraft) return;
    void AsyncStorage.setItem(
      draftKey(mode, user?.id),
      JSON.stringify({ ...draft, updatedAt: new Date().toISOString() }),
    ).catch(() => {
      // ignore storage failures
    });
  }, [ready, mode, user?.id, initialDraft, sliders, feelings, text, title, bullets, gratitude, promptIndex]);

  const prompt = PROMPTS[promptIndex] ?? PROMPTS[0]!;

  const canSave = (() => {
    if (mode === "mood") return true;
    if (mode === "voice") return !!audio.recording;
    if (mode === "bullets") return bullets.some((b) => b.trim());
    if (mode === "gratitude") return gratitude.some((g) => g.trim());
    return text.trim().length > 0;
  })();

  // Same check, used to decide whether leaving needs a confirmation.
  const hasContent = canSave;

  const save = async () => {
    if (!user || saving || !canSave) return;
    setSaving(true);
    setSaveError(null);
    try {
      let audioPath: string | undefined;
      if (mode === "voice" && audio.recording) {
        const bytes = await new File(audio.recording.uri).arrayBuffer();
        audioPath = await uploadVoiceMemo(user.id, bytes, audio.recording.mimeType);
      }

      const bound = (field: "mood" | "energy") => {
        const spec = specs.find((s) => s.field === field);
        return spec ? sliders[spec.id] ?? 3 : 3;
      };

      const intent = specs.map((s) => `${s.question} → ${s.steps[(sliders[s.id] ?? 3) - 1]}`);

      const draft: NewEntry = {
        mode,
        mood: bound("mood"),
        energy: bound("energy"),
        feelings,
        intent: intent.length ? intent : undefined,

        title: title.trim() || undefined,
        text: text.trim() || undefined,
        bullets: mode === "bullets" ? bullets.map((b) => b.trim()).filter(Boolean) : undefined,
        gratitude: mode === "gratitude" ? gratitude.map((g) => g.trim()).filter(Boolean) : undefined,
        prompt: mode === "prompt" ? prompt : undefined,
        audioPath,
        audioSeconds: audioPath ? audio.seconds : undefined,
      };

      const entry = await addEntry(draft);
      await AsyncStorage.removeItem(draftKey(mode, user?.id)).catch(() => {});
      await rememberSliders(mode, sliders, user?.id);
      toast("Saved privately.");
      setSaved(entry);
      // Starts the songs and the advice now so the panels are usually ready by
      // the time a finger arrives. Nothing here blocks the save or the toast.
      warmAftercare(entry, settings, updateEntry);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "This couldn't be saved just now.");
    } finally {
      setSaving(false);
    }
  };

  const leave = async () => {
    await AsyncStorage.removeItem(draftKey(mode, user?.id)).catch(() => {});
    router.replace("/");
  };

  if (saved) {
    // The store's copy, not the one held here: the warm fetches write the songs
    // and the advice onto the entry after this page has already handed it over.
    const current = entries.find((e) => e.id === saved.id) ?? saved;
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]} edges={["top"]}>
        <View style={styles.body}>
          <Aftercare entry={current} />
        </View>
      </SafeAreaView>
    );
  }

  const heading =
    mode === "prompt"
      ? prompt
      : mode === "gratitude"
        ? "Three small things"
        : mode === "mood"
          ? "How are you, really?"
          : mode === "voice"
            ? "Say it out loud"
            : mode === "bullets"
              ? "Dump it out"
              : mode === "longform"
                ? "Room to write"
                : "Quick check-in";

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]} edges={["top"]}>
      <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.headerRow}>
            <Pressable
              onPress={() => (hasContent ? setConfirmLeave(true) : void leave())}
              style={styles.backLink}
              accessibilityRole="button"
              hitSlop={6}
            >
              <ArrowLeft color={theme.colors.mutedForeground} size={16} strokeWidth={1.5} />
              <Text style={[styles.backLabel, { color: theme.colors.mutedForeground }]}>Back</Text>
            </Pressable>
            <View
              style={[
                styles.modeBadge,
                { borderColor: withAlpha(theme.colors.accent, 0.4), backgroundColor: withAlpha(theme.colors.accent, 0.12) },
              ]}
            >
              <Icon size={14} color={modeGlyphColor(mode, theme.colors.accent)} strokeWidth={1.75} />
              <Text style={[styles.modeBadgeLabel, { color: theme.colors.foreground }]}>{meta.label}</Text>
            </View>
          </View>

          <Text style={[styles.heading, { color: theme.colors.foreground }]}>{heading}</Text>
          <PageUnderline style={styles.underline} />

          {mode === "prompt" && (
            <Pressable
              onPress={() => setPromptIndex((i) => (i + 1) % PROMPTS.length)}
              style={styles.shuffleLink}
              accessibilityRole="button"
              accessibilityLabel="Different question"
            >
              <Shuffle color={theme.colors.mutedForeground} size={14} strokeWidth={1.5} />
              <Text style={[styles.shuffleLabel, { color: theme.colors.mutedForeground }]}>Different question</Text>
            </Pressable>
          )}

          {restedDraft && (
            <Text style={[styles.restedNote, { color: theme.colors.mutedForeground }]}>Still here whenever</Text>
          )}

          {ready && (
            <View style={styles.sections}>
              <CheckInSliders
                mode={mode}
                values={sliders}
                carriedOver={carried}
                onValue={(id, v) => {
                  setSliders((prev) => ({ ...prev, [id]: v }));
                  setCarried(false);
                }}
                feelings={feelings}
                onFeelings={setFeelings}
                showFeelings={mode !== "voice" && mode !== "gratitude"}
              />

              {mode === "longform" && (
                <View style={styles.stack}>
                  <TextInput
                    value={title}
                    onChangeText={setTitle}
                    placeholder="Title (optional)"
                    placeholderTextColor={theme.colors.mutedForeground}
                    style={[styles.titleInput, { color: theme.colors.foreground }]}
                  />
                  <TextInput
                    value={text}
                    onChangeText={setText}
                    placeholder="Start anywhere. Sentences don't have to connect."
                    placeholderTextColor={theme.colors.mutedForeground}
                    multiline
                    textAlignVertical="top"
                    style={[styles.textarea, styles.longformTextarea, { backgroundColor: theme.colors.card, color: theme.colors.foreground }]}
                  />
                </View>
              )}

              {(mode === "short" || mode === "prompt") && (
                <TextInput
                  value={text}
                  onChangeText={setText}
                  placeholder={mode === "prompt" ? "A sentence is enough." : "One or two lines about right now."}
                  placeholderTextColor={theme.colors.mutedForeground}
                  multiline
                  textAlignVertical="top"
                  style={[styles.textarea, styles.shortTextarea, { backgroundColor: theme.colors.card, color: theme.colors.foreground }]}
                />
              )}

              {mode === "bullets" && (
                <View style={styles.stack}>
                  {bullets.map((b, i) => (
                    <View key={i} style={styles.bulletRow}>
                      <Text style={[styles.bulletDash, { color: theme.colors.mutedForeground }]}>—</Text>
                      <TextInput
                        value={b}
                        onChangeText={(v) => setBullets(bullets.map((x, j) => (j === i ? v : x)))}
                        onSubmitEditing={() => setBullets([...bullets, ""])}
                        placeholder="a fragment"
                        placeholderTextColor={theme.colors.mutedForeground}
                        style={[styles.bulletInput, { backgroundColor: theme.colors.card, color: theme.colors.foreground }]}
                      />
                      {bullets.length > 1 && (
                        <Pressable
                          onPress={() => setBullets(bullets.filter((_, j) => j !== i))}
                          accessibilityRole="button"
                          accessibilityLabel="Remove line"
                          hitSlop={8}
                        >
                          <X color={theme.colors.mutedForeground} size={16} strokeWidth={1.5} />
                        </Pressable>
                      )}
                    </View>
                  ))}
                  <Pressable
                    onPress={() => setBullets([...bullets, ""])}
                    style={styles.addLine}
                    accessibilityRole="button"
                    accessibilityLabel="Add line"
                  >
                    <Plus color={theme.colors.mutedForeground} size={14} strokeWidth={1.5} />
                    <Text style={[styles.addLineLabel, { color: theme.colors.mutedForeground }]}>Add line</Text>
                  </Pressable>
                </View>
              )}

              {mode === "gratitude" && (
                <View style={styles.stack}>
                  {gratitude.map((g, i) => (
                    <TextInput
                      key={i}
                      value={g}
                      onChangeText={(v) => setGratitude(gratitude.map((x, j) => (j === i ? v : x)))}
                      placeholder={["something small", "someone", "something about you"][i] ?? "something"}
                      placeholderTextColor={theme.colors.mutedForeground}
                      style={[styles.gratitudeInput, { backgroundColor: theme.colors.card, color: theme.colors.foreground }]}
                    />
                  ))}
                  <Text style={[styles.gratitudeHint, { color: theme.colors.mutedForeground }]}>
                    One is fine.
                  </Text>
                </View>
              )}

              {mode === "voice" && (
                <VoiceRecorder
                  recording={audio.recording}
                  seconds={audio.seconds}
                  onChange={(recording, seconds) => setAudio({ recording, seconds })}
                />
              )}
            </View>
          )}

          {saveError && <Text style={[styles.errorText, { color: theme.colors.destructive }]}>{saveError}</Text>}
          {!user && (
            <Text style={[styles.mutedText, { color: theme.colors.mutedForeground }]}>Sign in to save entries.</Text>
          )}

          <View style={styles.actions}>
            <Button
              label="Save privately"
              onPress={() => void save()}
              disabled={!canSave || saving || !user}
            />
            <Button
              variant="ghost"
              label="Leave without saving"
              onPress={() => (hasContent ? setConfirmLeave(true) : void leave())}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <ConfirmDialog
        visible={confirmLeave}
        title="Leave without saving?"
        description="What you've written here will be discarded."
        confirmLabel="Leave"
        cancelLabel="Keep writing"
        destructive
        onConfirm={() => {
          setConfirmLeave(false);
          void leave();
        }}
        onCancel={() => setConfirmLeave(false)}
      />
    </SafeAreaView>
  );
};

const createStyles = (fonts: FontSet) => StyleSheet.create({
  safe: { flex: 1 },
  body: { flex: 1, paddingHorizontal: 20, paddingTop: 12 },
  scroll: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 56 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  backLink: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44 },
  backLabel: { fontFamily: fonts.body, fontSize: 14 },
  modeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  modeBadgeLabel: { fontFamily: fonts.bodySemiBold, fontSize: 11, letterSpacing: 0.4, textTransform: "uppercase" },
  heading: { marginTop: 28, fontFamily: fonts.display, fontSize: 28, lineHeight: 34 },
  underline: { marginTop: 10 },
  shuffleLink: { marginTop: 10, flexDirection: "row", alignItems: "center", gap: 8 },
  shuffleLabel: { fontFamily: fonts.body, fontSize: 14 },
  restedNote: { marginTop: 14, fontFamily: fonts.body, fontSize: 14 },
  sections: { marginTop: 36, gap: 40 },
  stack: { gap: 12 },
  titleInput: { height: 48, fontFamily: fonts.display, fontSize: 19 },
  textarea: { borderRadius: 20, padding: 18, fontFamily: fonts.body, fontSize: 16, lineHeight: 24 },
  longformTextarea: { minHeight: 280 },
  shortTextarea: { minHeight: 120 },
  bulletRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  bulletDash: { fontFamily: fonts.body, fontSize: 15 },
  bulletInput: { flex: 1, height: 44, borderRadius: 12, paddingHorizontal: 14, fontFamily: fonts.body, fontSize: 15 },
  addLine: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44 },
  addLineLabel: { fontFamily: fonts.body, fontSize: 14 },
  gratitudeInput: { height: 48, borderRadius: 12, paddingHorizontal: 14, fontFamily: fonts.body, fontSize: 15, letterSpacing: 0 },
  gratitudeHint: { fontFamily: fonts.body, fontSize: 12 },
  errorText: { marginTop: 24, fontFamily: fonts.body, fontSize: 14 },
  mutedText: { marginTop: 24, fontFamily: fonts.body, fontSize: 14 },
  actions: { marginTop: 48, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 16 },
});
