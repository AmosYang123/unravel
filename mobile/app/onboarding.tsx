import { useState } from "react";
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
import { X } from "lucide-react-native";
import { Button, Chip } from "@/components/ui";
import { FOCUS_AREAS, GOALS, MAX_INTERESTS, optionalSetupPatch, YEAR_LEVELS } from "@/lib/onboarding";
import { useSettings } from "@/lib/store";
import {
  applyTagOutcomes,
  keepOutcomesFor,
  replaceTag,
  resolveTags,
  splitTagInput,
  tagAction,
  tagNotice,
  type TagOutcome,
} from "@/lib/tags";
import type { YearLevel } from "@/lib/types";
import { useStyles, useTheme } from "@/theme/ThemeProvider";
import type { FontSet } from "@/theme/tokens";

/** Adds or removes one id, leaving the rest of the picks alone. */
const toggle = (list: string[], id: string): string[] =>
  list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

/**
 * Ported from src/pages/Onboarding.tsx. Same questions, same ids, same
 * once-only stamp; only the presentation is native.
 */
export default function OnboardingScreen() {
  const { theme } = useTheme();
  const styles = useStyles(createStyles);
  const router = useRouter();
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const editing = edit === "1";
  const { settings, loading, update } = useSettings();

  const [name, setName] = useState(settings.name);
  const [yearLevel, setYearLevel] = useState<YearLevel | "">(settings.yearLevel);
  const [focusAreas, setFocusAreas] = useState<string[]>(settings.focusAreas);
  const [goals, setGoals] = useState<string[]>(settings.goals);
  const [interests, setInterests] = useState<string[]>(settings.interests);
  const [interestDraft, setInterestDraft] = useState("");
  const [checking, setChecking] = useState(false);
  const [notices, setNotices] = useState<TagOutcome[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The boxes are seeded once from the profile, so nothing is rendered until
  // the profile is actually here — otherwise arriving before it lands would
  // seed them from the empty defaults and offer to save that back.
  if (loading) return <View style={[styles.safe, { backgroundColor: theme.colors.background }]} />;

  /**
   * What they typed goes up as a chip straight away — "guitar/piano" as two —
   * and the spelling check catches up afterwards. If it doesn't come back, or
   * suggestions are switched off, the words stand exactly as written.
   */
  const addInterest = async () => {
    const raw = interestDraft;
    const terms = splitTagInput(raw);
    if (!terms.length) return;
    setInterestDraft("");
    setNotices([]);

    const room = Math.max(0, MAX_INTERESTS - interests.length);
    const added = terms
      .filter((t) => !interests.some((i) => i.toLowerCase() === t.toLowerCase()))
      .slice(0, room);
    if (!added.length) return;
    setInterests([...interests, ...added]);

    setChecking(true);
    const outcomes = keepOutcomesFor(
      terms,
      added,
      await resolveTags("interest", raw, settings.aiSuggestionsEnabled),
    );
    setChecking(false);
    setInterests((current) => applyTagOutcomes(current, added, outcomes));
    setNotices(outcomes.filter((o) => o.status !== "kept"));
  };

  const dismiss = (outcome: TagOutcome) => setNotices((list) => list.filter((o) => o !== outcome));

  // Skipping still stamps onboardedAt, so the questions don't come back. Every
  // answer is still reachable from Settings afterwards.
  const finish = async (keepAnswers: boolean) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await update(
        keepAnswers
          ? optionalSetupPatch({ name, yearLevel, focusAreas, goals, interests, interestDraft }, new Date().toISOString())
          : { onboardedAt: new Date().toISOString() },
      );
      if (editing) router.back();
      else router.replace("/");
    } catch (err) {
      console.error("could not save onboarding answers", err);
      setError("That didn't save. Try once more, or skip for now.");
      setBusy(false);
    }
  };

  const question = (title: string, hint?: string) => (
    <>
      <Text style={[styles.question, { color: theme.colors.foreground }]}>{title}</Text>
      {hint ? <Text style={[styles.hint, { color: theme.colors.mutedForeground }]}>{hint}</Text> : null}
    </>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]}>
      <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={[styles.title, { color: theme.colors.foreground }]}>
            {editing ? "Your setup" : "A few optional things"}
          </Text>
          <Text style={[styles.lede, { color: theme.colors.mutedForeground }]}>
            Every question is optional. Answer only what feels useful, and change any answer later in Settings.
          </Text>

          {question("What should we call you? (optional)", "A name or nickname for greetings. Leaving it blank is completely fine.")}
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: theme.colors.card,
                borderColor: theme.colors.border,
                color: theme.colors.foreground,
              },
            ]}
            value={name}
            onChangeText={setName}
            maxLength={40}
            autoComplete="given-name"
            placeholderTextColor={theme.colors.mutedForeground}
          />

          {question("What grade are you in? (optional)", "Choose Prep, Lower, Upper or Senior, or leave this blank.")}
          <View style={styles.chips}>
            {YEAR_LEVELS.map((level) => (
              <Chip
                key={level.id}
                label={level.label}
                selected={yearLevel === level.id}
                onPress={() => setYearLevel(yearLevel === level.id ? "" : level.id)}
              />
            ))}
          </View>

          {question("What's on your plate right now? (optional)", "Choose any that fit. You can also choose none.")}
          <View style={styles.chips}>
            {FOCUS_AREAS.map((area) => (
              <Chip
                key={area.id}
                label={area.label}
                selected={focusAreas.includes(area.id)}
                onPress={() => setFocusAreas(toggle(focusAreas, area.id))}
              />
            ))}
          </View>

          {question("What would you like from this? (optional)", "Choose what you hope journaling might help with, or leave this blank.")}
          <View style={styles.chips}>
            {GOALS.map((goal) => (
              <Chip
                key={goal.id}
                label={goal.label}
                selected={goals.includes(goal.id)}
                onPress={() => setGoals(toggle(goals, goal.id))}
              />
            ))}
          </View>

          {question("Things you enjoy (optional)", "Add hobbies or interests that help recommendations feel relevant—for example drawing, football, gaming, cooking, or reading.")}
          <View style={styles.addRow}>
            <TextInput
              style={[
                styles.input,
                styles.addInput,
                {
                  backgroundColor: theme.colors.card,
                  borderColor: theme.colors.border,
                  color: theme.colors.foreground,
                },
              ]}
              value={interestDraft}
              onChangeText={setInterestDraft}
              onSubmitEditing={() => void addInterest()}
              returnKeyType="done"
              maxLength={40}
              editable={interests.length < MAX_INTERESTS}
              placeholderTextColor={theme.colors.mutedForeground}
            />
            <Button
              label="Add"
              variant="ghost"
              onPress={() => void addInterest()}
              disabled={!interestDraft.trim() || interests.length >= MAX_INTERESTS}
              style={styles.addButton}
            />
          </View>

          {checking && (
            <Text style={[styles.checking, { color: theme.colors.mutedForeground }]}>
              Checking the spelling…
            </Text>
          )}

          {notices.map((outcome) => {
            const action = tagAction(outcome);
            return (
              <View key={outcome.original} style={styles.noticeRow}>
                <Text style={[styles.notice, { color: theme.colors.mutedForeground }]}>
                  {tagNotice(outcome)}
                </Text>
                {action && (
                  <Pressable
                    onPress={() => {
                      setInterests((current) => replaceTag(current, outcome.value, action.value));
                      dismiss(outcome);
                    }}
                    accessibilityRole="button"
                    hitSlop={6}
                  >
                    <Text style={[styles.noticeAction, { color: theme.colors.foreground }]}>
                      {action.label}
                    </Text>
                  </Pressable>
                )}
                <Pressable onPress={() => dismiss(outcome)} accessibilityRole="button" hitSlop={6}>
                  <Text style={[styles.noticeAction, { color: theme.colors.foreground }]}>
                    {outcome.status === "unsure" ? "No, keep mine" : "Dismiss"}
                  </Text>
                </Pressable>
              </View>
            );
          })}

          {interests.length > 0 && (
            <View style={styles.chips}>
              {interests.map((interest) => (
                <Pressable
                  key={interest}
                  onPress={() => setInterests(interests.filter((i) => i !== interest))}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${interest}`}
                  hitSlop={6}
                  style={[styles.interest, { borderColor: theme.colors.border, backgroundColor: theme.colors.secondary }]}
                >
                  <Text style={[styles.interestText, { color: theme.colors.foreground }]}>{interest}</Text>
                  <X color={theme.colors.mutedForeground} size={12} strokeWidth={2} />
                </Pressable>
              ))}
            </View>
          )}

          {error && <Text style={[styles.error, { color: theme.colors.destructive }]}>{error}</Text>}

          <Button
            label={editing ? "Save changes" : "Save and continue"}
            onPress={() => void finish(true)}
            disabled={busy}
            style={styles.save}
          />

          {editing ? (
            <Pressable onPress={() => router.back()} disabled={busy} accessibilityRole="button">
              <Text style={[styles.skip, { color: theme.colors.mutedForeground }]}>Cancel</Text>
            </Pressable>
          ) : (
            <>
              <Pressable onPress={() => void finish(false)} disabled={busy} accessibilityRole="button">
                <Text style={[styles.skip, { color: theme.colors.mutedForeground }]}>Skip for now</Text>
              </Pressable>
              <Text style={[styles.hint, { color: theme.colors.mutedForeground }]}>
                This leaves every optional answer blank. You can add them later from Settings → Your setup.
              </Text>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (fonts: FontSet) => StyleSheet.create({
  safe: { flex: 1 },
  scroll: { paddingHorizontal: 24, paddingVertical: 40, maxWidth: 420, width: "100%", alignSelf: "center" },
  title: { fontFamily: fonts.display, fontSize: 28, lineHeight: 34 },
  lede: { fontFamily: fonts.body, fontSize: 14, lineHeight: 22, marginTop: 12 },
  question: { fontFamily: fonts.display, fontSize: 19, lineHeight: 26, marginTop: 32 },
  hint: { fontFamily: fonts.body, fontSize: 13, lineHeight: 20, marginTop: 6 },
  input: {
    fontFamily: fonts.body,
    fontSize: 16,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    marginTop: 14,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 },
  addRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  addInput: { flex: 1 },
  addButton: { marginTop: 14, paddingHorizontal: 20 },
  interest: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  interestText: { fontFamily: fonts.body, fontSize: 12 },
  noticeRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 12, rowGap: 4, marginTop: 8 },
  checking: { fontFamily: fonts.body, fontSize: 12, lineHeight: 18, marginTop: 8 },
  notice: { fontFamily: fonts.body, fontSize: 12, lineHeight: 18 },
  noticeAction: { fontFamily: fonts.body, fontSize: 12, lineHeight: 18, textDecorationLine: "underline" },
  error: { fontFamily: fonts.body, fontSize: 14, marginTop: 20 },
  save: { marginTop: 32 },
  skip: { fontFamily: fonts.body, fontSize: 14, marginTop: 20, textDecorationLine: "underline" },
});
