import { Link } from "expo-router";
import { AI_SHARING_NOTICE } from "@/lib/privacy";
import { releaseConfig } from "@/lib/release-config";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useRouter } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import {
  Button,
  Chip,
  ConfirmDialog,
  Dialog,
  PageTitle,
  PageUnderline,
  SectionLabel,
  toast,
  withAlpha,
} from "@/components/ui";
import { MODE_META } from "@/lib/content";
import { buildJournalExport } from "@/lib/exportJournal";
import { supabase } from "@/integrations/supabase/client";
import { invokeAuthedFunction } from "@/lib/edgeFunctions";
import { MIN_PASSWORD_LENGTH, passwordMeetsRule, useAuth } from "@/lib/auth";
import { useDeviceReminders } from "@/lib/notifications";
import {
  fetchAllEntries,
  hashPasscode,
  importLegacyLocalData,
  legacyLocalEntryCount,
  useEntries,
  useSettings,
} from "@/lib/store";
import type { Settings, ThemeName } from "@/lib/types";
import { useStyles, useTheme } from "@/theme/ThemeProvider";
import type { FontSet } from "@/theme/tokens";

/* ---------------------------------------------------------------------- */
/* Small local building blocks, standing in for src/components/settings/*  */
/* ---------------------------------------------------------------------- */

function Row({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  const { theme } = useTheme();
  const styles = useStyles(createStyles);
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, { color: theme.colors.foreground }]}>{title}</Text>
        {Boolean(description) && (
          <Text style={[styles.rowDescription, { color: theme.colors.mutedForeground }]}>{description}</Text>
        )}
      </View>
      <View style={styles.rowControl}>{children}</View>
    </View>
  );
}

/** One settings line that opens its controls in a dialog: name, current value, chevron. */
function SettingRow({
  title,
  value,
  onPress,
}: {
  title: string;
  /** Read at a glance, so the page is scannable without opening anything. */
  value: string;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const styles = useStyles(createStyles);
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={styles.row}>
      <Text style={[styles.rowTitle, { color: theme.colors.foreground }]}>{title}</Text>
      <View style={styles.settingRowValue}>
        <Text
          numberOfLines={1}
          style={[styles.mutedValue, styles.settingRowValueText, { color: theme.colors.mutedForeground }]}
        >
          {value}
        </Text>
        <ChevronRight size={16} color={theme.colors.mutedForeground} />
      </View>
    </Pressable>
  );
}

function Divider() {
  const { theme } = useTheme();
  const styles = useStyles(createStyles);
  return <View style={[styles.divider, { backgroundColor: withAlpha(theme.colors.border, 0.7) }]} />;
}

/* ---------------------------------------------------------------------- */
/* Appearance                                                              */
/* ---------------------------------------------------------------------- */

const THEME_SWATCHES: { id: ThemeName; label: string; swatch: string[] }[] = [
  { id: "system", label: "System", swatch: ["#ffffff", "#dedede", "#111111"] },
  { id: "linen", label: "Linen", swatch: ["#f4efe6", "#e6ded1", "#c48c6e"] },
  { id: "blush", label: "Blush", swatch: ["#fbeaee", "#f4d5dd", "#d97e9c"] },
  { id: "mist", label: "Mist", swatch: ["#e4f0f8", "#cfe3f0", "#4a95bf"] },
  { id: "sage", label: "Sage", swatch: ["#e8f6ec", "#d3ebd9", "#49a179"] },
  { id: "lilac", label: "Lilac", swatch: ["#f0e9f9", "#e2d6f3", "#a077d1"] },
  { id: "dusk", label: "Dusk", swatch: ["#181a26", "#262a3b", "#a58ad6"] },
  { id: "ink", label: "Ink", swatch: ["#141312", "#242220", "#c99a63"] },
];

const FONT_PAIRINGS = [
  { display: "Fraunces", body: "Karla", label: "Soft serif" },
  { display: "Karla", body: "Karla", label: "All sans" },
  { display: "Fraunces", body: "Fraunces", label: "All serif" },
];

function AppearanceSection() {
  const { theme, fonts, setTheme } = useTheme();
  const styles = useStyles(createStyles);
  const { settings, update } = useSettings();
  const [open, setOpen] = useState(false);

  const themeLabel = THEME_SWATCHES.find((t) => t.id === settings.theme)?.label ?? settings.theme;
  const fontLabel =
    FONT_PAIRINGS.find((f) => f.display === settings.displayFont && f.body === settings.bodyFont)?.label ??
    settings.displayFont;

  return (
    <>
      <SettingRow title="Appearance" value={`${themeLabel}, ${fontLabel}`} onPress={() => setOpen(true)} />

      <Dialog visible={open} onClose={() => setOpen(false)} title="Appearance">
        <View style={styles.themeGrid}>
          {THEME_SWATCHES.map((t) => {
            const active = settings.theme === t.id;
            return (
              <Pressable
                key={t.id}
                onPress={() => {
                  setTheme(t.id);
                  void update({ theme: t.id });
                }}
                style={[
                  styles.themeCard,
                  {
                    backgroundColor: theme.colors.card,
                    borderColor: active ? withAlpha(theme.colors.accent, 0.6) : withAlpha(theme.colors.border, 0.7),
                  },
                ]}
              >
                <View style={styles.swatchRow}>
                  {t.swatch.map((c) => (
                    <View key={c} style={[styles.swatchDot, { backgroundColor: c }]} />
                  ))}
                </View>
                <Text
                  style={[
                    styles.themeLabel,
                    { color: active ? theme.colors.foreground : theme.colors.mutedForeground },
                    active && { fontFamily: fonts.bodySemiBold },
                  ]}
                >
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.chipRow}>
          {FONT_PAIRINGS.map((f) => (
            <Chip
              key={f.label}
              label={f.label}
              selected={settings.displayFont === f.display && settings.bodyFont === f.body}
              onPress={() => void update({ displayFont: f.display, bodyFont: f.body })}
            />
          ))}
        </View>
      </Dialog>
    </>
  );
}

/* ---------------------------------------------------------------------- */
/* You                                                                     */
/* ---------------------------------------------------------------------- */

const NAME_DEBOUNCE_MS = 500;

function ProfileSection() {
  const { theme } = useTheme();
  const styles = useStyles(createStyles);
  const { settings, update } = useSettings();
  const [open, setOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState(settings.name);

  useEffect(() => {
    setNameDraft(settings.name);
  }, [settings.name]);

  useEffect(() => {
    if (nameDraft === settings.name) return;
    const id = setTimeout(() => void update({ name: nameDraft }), NAME_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [nameDraft, settings.name, update]);

  const pendingRef = useRef({ nameDraft, name: settings.name, update });
  pendingRef.current = { nameDraft, name: settings.name, update };
  useEffect(() => {
    return () => {
      const { nameDraft: draft, name, update: doUpdate } = pendingRef.current;
      if (draft !== name) void doUpdate({ name: draft });
    };
  }, []);

  const summary = settings.name.trim() || "No name";

  return (
    <>
      <SettingRow title="You" value={summary} onPress={() => setOpen(true)} />

      <Dialog visible={open} onClose={() => setOpen(false)} title="You">
        <Row title="Name or nickname" description="Only used in greetings. Leave blank if you'd rather not.">
          <TextInput
            value={nameDraft}
            onChangeText={setNameDraft}
            placeholder="optional"
            placeholderTextColor={theme.colors.mutedForeground}
            style={[
              styles.textInput,
              styles.nameInput,
              { backgroundColor: theme.colors.card, color: theme.colors.foreground, borderColor: theme.colors.border },
            ]}
          />
        </Row>

      </Dialog>
    </>
  );
}

/* ---------------------------------------------------------------------- */
/* Check-in rhythm                                                         */
/* ---------------------------------------------------------------------- */

const REMINDER_MODES = [
  { id: "manual", label: "Only when I open it" },
  { id: "daily", label: "Daily" },
  { id: "days", label: "Certain days" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
] as const satisfies readonly { id: Settings["reminderMode"]; label: string }[];

const REMINDER_DAY_LABELS = [
  { short: "S", full: "Sunday" },
  { short: "M", full: "Monday" },
  { short: "T", full: "Tuesday" },
  { short: "W", full: "Wednesday" },
  { short: "T", full: "Thursday" },
  { short: "F", full: "Friday" },
  { short: "S", full: "Saturday" },
];

const TEST_SENT = "Sent. Give it a minute, then check your inbox — or spam, if it's not there.";
const TEST_FAILED = "That didn't send. Try again in a moment.";

/** The function's own wording when it has one, never its internals. */
const testFailureMessage = async (error: unknown): Promise<string> => {
  const context = (error as { context?: Response }).context;
  if (!context || typeof context.text !== "function") return TEST_FAILED;
  try {
    const parsed: unknown = JSON.parse(await context.text());
    if (parsed && typeof parsed === "object" && "error" in parsed && typeof parsed.error === "string") {
      return parsed.error;
    }
  } catch {
    /* fall through to the generic line */
  }
  return TEST_FAILED;
};

function RemindersSection() {
  const { theme } = useTheme();
  const styles = useStyles(createStyles);
  const { settings, update } = useSettings();
  const { user } = useAuth();
  const {
    enabled: phoneEnabled,
    permission: phonePermission,
    setEnabled: setPhoneEnabled,
    busy: phoneBusy,
    error: phoneError,
    sendTestNotification,
  } = useDeviceReminders(settings);
  const [open, setOpen] = useState(false);
  const [testsOpen, setTestsOpen] = useState(false);
  const [testState, setTestState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [testMessage, setTestMessage] = useState("");
  const [notificationTestState, setNotificationTestState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [timeInput, setTimeInput] = useState(settings.reminderTime);
  useEffect(() => setTimeInput(settings.reminderTime), [settings.reminderTime]);
  const saveTime = async () => {
    const time = timeInput.trim();
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      toast("Use a time like 09:00 or 21:30.");
      setTimeInput(settings.reminderTime);
      return;
    }
    if (time === settings.reminderTime) return;
    try {
      await update({ reminderTime: time });
    } catch {
      setTimeInput(settings.reminderTime);
      toast("Couldn't save that time. Please try again.");
    }
  };

  // Says what is actually true, including when the phone has taken the
  // permission back, rather than showing a switch that would do nothing.
  const phoneDescription = phoneError ?? (
    phonePermission === "denied"
      ? "Notifications are turned off for Unravel in your phone's settings. Turn them on there and these will start arriving."
      : "A quiet notification at the time above. Set separately on each phone you use.");

  const sendTest = async () => {
    setTestState("sending");
    try {
      const data = await invokeAuthedFunction<{ sent?: boolean; error?: string }>("send-test-reminder");
      if (data.error) throw new Error(data.error);
    } catch (error) {
      console.error("Test reminder failed", error);
      setTestMessage(error instanceof Error ? error.message : TEST_FAILED);
      setTestState("error");
      return;
    }
    setTestMessage(TEST_SENT);
    setTestState("sent");
  };

  const modeLabel = REMINDER_MODES.find((r) => r.id === settings.reminderMode)?.label ?? "Off";
  const summary =
    settings.reminderMode === "manual" ? modeLabel : `${modeLabel}, ${settings.reminderTime}`;
  const delivery = [phoneEnabled && "App", settings.reminderEmails && "Email"].filter(Boolean).join(" + ") || "Off";
  const activateRhythm = settings.reminderMode === "manual" ? { reminderMode: "days" as const } : {};

  return (
    <>
      <SettingRow title="Reminders" value={`${summary} · ${delivery}`} onPress={() => setOpen(true)} />
      <Divider />
      <SettingRow title="Tests" value="Email and app notification" onPress={() => setTestsOpen(true)} />

      <Dialog
        visible={open}
        onClose={() => setOpen(false)}
        title="Check-in rhythm"
        description="How often Unravel reminds you to check in, and where the reminder arrives."
      >
        <View style={styles.chipRow}>
          {REMINDER_MODES.map((r) => (
            <Chip
              key={r.id}
              label={r.label}
              selected={settings.reminderMode === r.id}
              onPress={() => void update({ reminderMode: r.id })}
            />
          ))}
        </View>

        {settings.reminderMode === "days" && (
          <View style={styles.dayRow}>
            {REMINDER_DAY_LABELS.map((d, i) => (
              <Chip
                key={i}
                label={d.short}
                selected={settings.reminderDays.includes(i)}
                accessibilityLabel={d.full}
                onPress={() =>
                  void update({
                    reminderDays: settings.reminderDays.includes(i)
                      ? settings.reminderDays.filter((x) => x !== i)
                      : [...settings.reminderDays, i],
                  })
                }
              />
            ))}
          </View>
        )}

        {settings.reminderMode !== "manual" && (
          <View>
            <Row
              title="Time"
              description={`Sent around this time, in your local time zone (${settings.timezone}).`}
            >
              <TextInput
                value={timeInput}
                onChangeText={setTimeInput}
                onEndEditing={() => void saveTime()}
                maxLength={5}
                accessibilityLabel="Reminder time in 24-hour format"
                placeholder="21:00"
                placeholderTextColor={theme.colors.mutedForeground}
                keyboardType="numbers-and-punctuation"
                style={[
                  styles.textInput,
                  styles.timeInput,
                  { backgroundColor: theme.colors.card, color: theme.colors.foreground, borderColor: theme.colors.border },
                ]}
              />
            </Row>
            <Divider />
          </View>
        )}

        <SectionLabel>Delivery</SectionLabel>
        <Text style={[styles.helperText, { color: theme.colors.mutedForeground }]}>
          Choose either option or use both. Turning one on also starts the default certain-days rhythm if reminders are off.
        </Text>
        <View>
            <Row title="App notification" description={phoneDescription}>
              {phonePermission === "denied" ? (
                <Button label="Open settings" variant="ghost" onPress={() => void Linking.openSettings()} />
              ) : (
                <Switch
                  disabled={phoneBusy}
                  value={phoneEnabled}
                  onValueChange={(v) => void (async () => {
                    if (v) await update(activateRhythm);
                    await setPhoneEnabled(v);
                  })()}
                  trackColor={{ true: theme.colors.accent }}
                />
              )}
            </Row>
            <Divider />
            <Row
              title="Email reminders"
              description={`A short reminder email to ${user?.email ?? "your email"}. Turn it off any time.`}
            >
              <Switch
                value={settings.reminderEmails}
                onValueChange={(v) => void update({ ...activateRhythm, reminderEmails: v })}
                trackColor={{ true: theme.colors.accent }}
              />
            </Row>
            <Divider />
            <Row
              title="Discreet wording"
              description='Reminders read "A moment for you" — never the app name or your mood.'
            >
              <Switch
                value={settings.discreetNotifications}
                onValueChange={(v) => void update({ discreetNotifications: v })}
                trackColor={{ true: theme.colors.accent }}
              />
            </Row>
          </View>
      </Dialog>

      <Dialog
        visible={testsOpen}
        onClose={() => setTestsOpen(false)}
        title="Test reminders"
        description="Check each delivery method without changing your reminder schedule."
      >
        <Row title="Email" description={`Send one reminder to ${user?.email ?? "your email"}.`}>
          <Button
            label={testState === "sending" ? "Sending…" : testState === "sent" ? "Send again" : "Send a test"}
            variant="ghost"
            disabled={testState === "sending"}
            onPress={() => void sendTest()}
          />
        </Row>
        {(testState === "sent" || testState === "error") && (
          <Text accessibilityLiveRegion="polite" style={[styles.testStatus, {
            color: testState === "error" ? theme.colors.destructive : theme.colors.mutedForeground,
          }]}>{testMessage}</Text>
        )}
        <Divider />
        <Row title="App notification" description="Send a notification to this phone immediately.">
          <Button
            label={notificationTestState === "sending" ? "Sending…" : "Send a test"}
            variant="ghost"
            disabled={phoneBusy || notificationTestState === "sending"}
            onPress={() => void (async () => {
              setNotificationTestState("sending");
              const sent = await sendTestNotification();
              setNotificationTestState(sent ? "sent" : "error");
            })()}
          />
        </Row>
        {(notificationTestState === "sent" || notificationTestState === "error") && (
          <Text accessibilityLiveRegion="polite" style={[styles.testStatus, {
            color: notificationTestState === "error" ? theme.colors.destructive : theme.colors.mutedForeground,
          }]}>
            {notificationTestState === "sent"
              ? "Sent to this phone. If it didn't appear, check Unravel in iOS notification settings."
              : (phoneError ?? "Notifications aren't allowed yet. Enable them in iOS Settings and try again.")}
          </Text>
        )}
      </Dialog>
    </>
  );
}

/* ---------------------------------------------------------------------- */
/* Account                                                                 */
/* ---------------------------------------------------------------------- */

/** Supabase error strings are not for end users; map the ones expected. */
const describeAuthError = (err: unknown): string => {
  console.error("auth error", err);
  const raw =
    typeof err === "object" && err !== null && "message" in err && typeof err.message === "string"
      ? err.message.toLowerCase()
      : "";
  if (raw.includes("already registered") || raw.includes("already been registered"))
    return "There's already an account for that address. Try signing in instead.";
  if (raw.includes("rate limit") || raw.includes("too many requests") || raw.includes("for security purposes"))
    return "Too many attempts just now. Wait a minute and try again.";
  if (raw.includes("password") && (raw.includes("short") || raw.includes("least") || raw.includes("weak")))
    return `That password is too short for this account. Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  return "Something went wrong. Try again in a moment.";
};

function AccountSection() {
  const { theme } = useTheme();
  const styles = useStyles(createStyles);
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [upgradeEmail, setUpgradeEmail] = useState("");
  const [upgradePassword, setUpgradePassword] = useState("");
  const [upgrading, setUpgrading] = useState(false);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);
  const [upgradeNotice, setUpgradeNotice] = useState<string | null>(null);
  const [legacyCount, setLegacyCount] = useState(0);
  const [importing, setImporting] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminCheckFailed, setAdminCheckFailed] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutMessage, setSignOutMessage] = useState("Signing out…");
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);
  const [devAction, setDevAction] = useState<"reset" | "delete" | null>(null);
  const [devBusy, setDevBusy] = useState(false);
  const [devNotice, setDevNotice] = useState<string | null>(null);

  const isGuest = user?.is_anonymous === true;
  const isDeveloper = user?.email?.toLowerCase() === "amosyangg@icloud.com";
  const canUpgrade = upgradeEmail.trim().length > 3 && passwordMeetsRule(upgradePassword) && !upgrading;

  useEffect(() => {
    if (!signingOut) {
      setSignOutMessage("Signing out…");
      return;
    }
    const timer = setTimeout(() => setSignOutMessage("Closing your private session…"), 900);
    return () => clearTimeout(timer);
  }, [signingOut]);

  // AsyncStorage has no synchronous read, so this is fetched once on mount
  // rather than initialised inline the way web's legacyLocalEntryCount() is.
  useEffect(() => {
    let cancelled = false;
    void legacyLocalEntryCount().then((n) => {
      if (!cancelled) setLegacyCount(n);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("Could not check admin role", error);
          setIsAdmin(false);
          setAdminCheckFailed(true);
          return;
        }
        setAdminCheckFailed(false);
        setIsAdmin(!!data);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const upgradeAccount = async () => {
    if (!canUpgrade) return;
    setUpgrading(true);
    setUpgradeError(null);
    setUpgradeNotice(null);
    const { data, error } = await supabase.auth.updateUser({
      email: upgradeEmail.trim(),
      password: upgradePassword,
    });
    if (error) {
      setUpgradeError(describeAuthError(error));
    } else if (data.user?.email) {
      setUpgradeNotice("That's done. Your journal is now on this address.");
      setUpgradePassword("");
    } else {
      setUpgradeNotice(
        `We've sent a confirmation link to ${upgradeEmail.trim()}. Open it to finish attaching the address — until then this stays a guest journal.`,
      );
      setUpgradePassword("");
    }
    setUpgrading(false);
  };

  const deleteAccount = async () => {
    if (deletingAccount) return;
    setConfirmDeleteAccount(false);
    setDeletingAccount(true);
    setDeleteAccountError(null);
    try {
      const result = await invokeAuthedFunction<{ deleted: boolean }>("delete-account");
      if (result?.deleted !== true) throw new Error("Account deletion was not confirmed. Please try again.");
      await signOut();
    } catch (error) {
      console.error("Account deletion failed", error);
      setDeleteAccountError(error instanceof Error ? error.message : "We couldn't delete your account. Please try again.");
      setDeletingAccount(false);
    }
  };

  const runDevAction = async () => {
    const action = devAction;
    if (!action || devBusy) return;
    setDevAction(null);
    setDevBusy(true);
    setDevNotice(null);
    try {
      const result = await invokeAuthedFunction<{ affected: number }>("dev-control", { action });
      setDevNotice(
        action === "reset"
          ? `Reset ${result.affected} test ${result.affected === 1 ? "account" : "accounts"}.`
          : `Deleted ${result.affected} test ${result.affected === 1 ? "account" : "accounts"}.`,
      );
    } catch (error) {
      console.error("Developer action failed", error);
      setDevNotice(error instanceof Error ? error.message : "The developer action didn't finish.");
    } finally {
      setDevBusy(false);
    }
  };

  return (
    <>
      <SettingRow title="Account" value={user?.email ?? "Guest"} onPress={() => setOpen(true)} />

      <Dialog visible={open} onClose={() => setOpen(false)} title="Account">
        <Row
          title="Signed in as"
          description={
            isGuest
              ? "This journal lives on this device. Add an email below and it becomes an account you can get back into."
              : "Entries, recordings and these preferences are saved to this account only."
          }
        >
          <Text style={[styles.mutedValue, { color: theme.colors.mutedForeground }]}>{user?.email ?? "Guest"}</Text>
        </Row>

        {isGuest && (
          <View style={styles.guestBlock}>
            <Text style={[styles.rowTitle, { color: theme.colors.foreground }]}>Keep this journal</Text>
            <Text style={[styles.rowDescription, { color: theme.colors.mutedForeground }]}>
              Adding an email and password turns this guest journal into an account. Nothing moves or is copied —
              every entry, recording and preference stays exactly where it is, on the same account.
            </Text>
            <Text style={[styles.fieldLabel, { color: theme.colors.mutedForeground }]}>Email</Text>
            <TextInput
              value={upgradeEmail}
              onChangeText={setUpgradeEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              style={[
                styles.textInput,
                styles.fullWidthInput,
                { backgroundColor: theme.colors.card, color: theme.colors.foreground, borderColor: theme.colors.border },
              ]}
            />
            <Text style={[styles.fieldLabel, { color: theme.colors.mutedForeground }]}>Password</Text>
            <TextInput
              value={upgradePassword}
              onChangeText={setUpgradePassword}
              secureTextEntry
              style={[
                styles.textInput,
                styles.fullWidthInput,
                { backgroundColor: theme.colors.card, color: theme.colors.foreground, borderColor: theme.colors.border },
              ]}
            />
            <Text style={[styles.helperText, { color: theme.colors.mutedForeground }]}>
              At least {MIN_PASSWORD_LENGTH} characters
            </Text>
            {upgradeError && <Text style={[styles.errorText, { color: theme.colors.destructive }]}>{upgradeError}</Text>}
            {upgradeNotice && (
              <Text style={[styles.helperText, { color: theme.colors.mutedForeground }]}>{upgradeNotice}</Text>
            )}
            <Button
              label={upgrading ? "Saving…" : "Add email and password"}
              onPress={() => void upgradeAccount()}
              disabled={!canUpgrade}
              style={styles.guestSubmit}
            />
          </View>
        )}

        {legacyCount > 0 && (
          <>
            <Divider />
            <Row
              title="Entries saved in this browser"
              description={`${legacyCount} older ${legacyCount === 1 ? "entry" : "entries"} from before you had an account. Move them into it?`}
            >
              <Button
                label={importing ? "Moving…" : "Move them"}
                variant="ghost"
                disabled={importing}
                onPress={() => {
                  setImporting(true);
                  importLegacyLocalData()
                    .then((n) => {
                      setLegacyCount(0);
                      toast(`Moved ${n} ${n === 1 ? "entry" : "entries"} into your account.`);
                    })
                    .catch((err: unknown) => {
                      console.error("Legacy import failed", err);
                      toast("That import didn't finish. Try again.");
                    })
                    .finally(() => setImporting(false));
                }}
              />
            </Row>
          </>
        )}

        {adminCheckFailed && (
          <>
            <Divider />
            <Row title="Impact metrics" description="We couldn't check your account permissions just now. Reload to try again.">
              <Text style={[styles.mutedValue, { color: theme.colors.mutedForeground }]}>Unavailable</Text>
            </Row>
          </>
        )}

        {isAdmin && (
          <>
            <Divider />
            <Row title="Impact metrics" description="Aggregate mood and energy across all accounts. No entry text, ever.">
              <Button
                label="Open"
                variant="ghost"
                onPress={() => {
                  setOpen(false);
                  router.push("/impact");
                }}
              />
            </Row>
          </>
        )}

        {isDeveloper && (
          <>
            <Divider />
            <Text style={[styles.subLabel, { color: theme.colors.foreground }]}>Developer controls</Text>
            <Text style={[styles.rowDescription, { color: theme.colors.mutedForeground }]}>
              These affect every test account except amosyangg@icloud.com.
            </Text>
            <Row title="Reset test accounts" description="Delete their entries and recordings, then clear their setup preferences while keeping the accounts.">
              <Button label={devBusy ? "Working…" : "Reset all"} variant="ghost" disabled={devBusy} onPress={() => setDevAction("reset")} />
            </Row>
            <Divider />
            <Row title="Delete test accounts" description="Permanently delete every other authentication account and all of its app data.">
              <Button label={devBusy ? "Working…" : "Delete all"} variant="ghost" tone="destructive" disabled={devBusy} onPress={() => setDevAction("delete")} />
            </Row>
            {devBusy && <View style={styles.devProgress}><ActivityIndicator color={theme.colors.accent} /><Text style={[styles.helperText, { color: theme.colors.mutedForeground }]}>Updating test accounts…</Text></View>}
            {devNotice && <Text accessibilityLiveRegion="polite" style={[styles.helperText, { color: theme.colors.mutedForeground }]}>{devNotice}</Text>}
            <ConfirmDialog
              visible={devAction !== null}
              title={devAction === "delete" ? "Delete every test account?" : "Reset every test account?"}
              description={devAction === "delete"
                ? "Every account except amosyangg@icloud.com and all of their data will be permanently deleted. This cannot be undone."
                : "Every other account will keep its sign-in, but its entries, recordings and setup will be permanently cleared."}
              confirmLabel={devAction === "delete" ? "Delete all" : "Reset all"}
              cancelLabel="Cancel"
              destructive
              onCancel={() => setDevAction(null)}
              onConfirm={() => void runDevAction()}
            />
          </>
        )}

        <Divider />
        <Row
          title="Sign out"
          description={
            isGuest
              ? "A guest journal has no email to sign back in with, so signing out leaves it behind for good."
              : "You'll need your email and password to get back in."
          }
        >
          <Button
            label={signingOut ? signOutMessage : "Sign out"}
            variant="ghost"
            disabled={signingOut}
            icon={signingOut ? <ActivityIndicator size="small" color={theme.colors.foreground} /> : undefined}
            onPress={() => void (async () => {
              setSigningOut(true);
              await signOut();
            })()}
          />
        </Row>
        <Divider />
        <Row
          title="Delete account"
          description="Permanently deletes your entries, recordings, preferences and account. This can't be undone."
        >
          <Button
            label={deletingAccount ? "Deleting…" : "Delete account"}
            variant="ghost"
            tone="destructive"
            disabled={deletingAccount}
            icon={deletingAccount ? <ActivityIndicator size="small" color={theme.colors.destructive} /> : undefined}
            onPress={() => setConfirmDeleteAccount(true)}
          />
        </Row>
        {deleteAccountError && <Text style={[styles.errorText, { color: theme.colors.destructive }]}>{deleteAccountError}</Text>}

        <ConfirmDialog
          visible={confirmDeleteAccount}
          title="Delete your account?"
          description="Every entry, voice recording and preference will be permanently deleted. This cannot be undone."
          confirmLabel="Delete forever"
          cancelLabel="Keep my account"
          destructive
          onCancel={() => setConfirmDeleteAccount(false)}
          onConfirm={() => void deleteAccount()}
        />
      </Dialog>
    </>
  );
}

/* ---------------------------------------------------------------------- */
/* Privacy & data                                                          */
/* ---------------------------------------------------------------------- */

interface PrivacySectionProps {
  exporting: boolean;
  onExport: () => void;
  onClearAllRequest: () => void;
}

/**
 * Stays open on the page rather than behind a row: two of these are single
 * switches, and the AI suggestions one is a privacy control worth seeing
 * without a tap. Only "Recently deleted", a list, opens in a dialog.
 */
function PrivacySection({ exporting, onExport, onClearAllRequest }: PrivacySectionProps) {
  const [confirmSharing, setConfirmSharing] = useState(false);
  const [savingSharing, setSavingSharing] = useState(false);
  const { theme } = useTheme();
  const styles = useStyles(createStyles);
  const { settings, update } = useSettings();
  const { deletedEntries, loading, error, restoreEntry, purgeEntry } = useEntries();
  const [savingCode, setSavingCode] = useState(false);
  const [editingCode, setEditingCode] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [confirmCode, setConfirmCode] = useState("");
  const [showDeleted, setShowDeleted] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<string | null>(null);

  const saveSharing = async (enabled: boolean) => {
    setConfirmSharing(false);
    setSavingSharing(true);
    try {
      await update({ aiSuggestionsEnabled: enabled });
    } catch {
      toast("Couldn't save your sharing choice. Please try again.");
    } finally {
      setSavingSharing(false);
    }
  };

  const closeCodeEditor = () => {
    setEditingCode(false);
    setNewCode("");
    setConfirmCode("");
  };

  const toggleLock = async (enabled: boolean) => {
    if (enabled) {
      setEditingCode(true);
      return;
    }
    setSavingCode(true);
    try {
      await update({ lockEnabled: false, passcode: "" });
      closeCodeEditor();
    } catch {
      toast("Couldn't turn off the lock. Please try again.");
    } finally {
      setSavingCode(false);
    }
  };

  const saveCode = async () => {
    if (savingCode) return;
    if (newCode.length !== 4) {
      toast("Your code needs to be 4 digits.");
      return;
    }
    if (newCode !== confirmCode) {
      toast("Those two codes don't match.");
      return;
    }
    setSavingCode(true);
    try {
      await update({ lockEnabled: true, passcode: await hashPasscode(newCode) });
      closeCodeEditor();
      toast("Code saved.");
    } catch (err) {
      console.error("Passcode save failed", err);
      toast("That didn't save. Please try again.");
    } finally {
      setSavingCode(false);
    }
  };

  const handleRestore = async (id: string) => {
    setPendingId(id);
    try {
      await restoreEntry(id);
      toast("Entry restored.");
    } catch (err) {
      console.error("Restore failed", err);
      toast("That didn't restore. Try again.");
    } finally {
      setPendingId(null);
    }
  };

  const handlePurge = async (id: string) => {
    setPendingId(id);
    try {
      await purgeEntry(id);
    } catch (err) {
      console.error("Purge failed", err);
      toast("That didn't delete. Try again.");
    } finally {
      setPendingId(null);
    }
  };

  const deletedSummary = loading
    ? "Loading…"
    : error
      ? "Unavailable"
      : deletedEntries.length === 0
        ? "Nothing here"
        : `${deletedEntries.length} ${deletedEntries.length === 1 ? "entry" : "entries"}`;

  return (
    <View style={styles.section}>
      <SectionLabel>Privacy &amp; data</SectionLabel>
      <Link href="/privacy" style={{ color: theme.colors.foreground, textDecorationLine: "underline", paddingVertical: 16 }}>Privacy policy</Link>
      {releaseConfig.supportUrl ? <Link href={releaseConfig.supportUrl} style={{ color: theme.colors.foreground, textDecorationLine: "underline", paddingVertical: 16 }}>Support</Link> : null}
      <Row title="Passcode lock" description="Ask for a 4-digit code when the app opens, on top of your password.">
        <Switch
          value={settings.lockEnabled}
          disabled={savingCode}
          onValueChange={(v) => void toggleLock(v)}
          trackColor={{ true: theme.colors.accent }}
        />
      </Row>
      {(settings.lockEnabled || editingCode) && (
        <>
          <Divider />
          <Row title="Code" description="A quick second lock — not a replacement for your password.">
            {editingCode ? (
              <View style={styles.codeEditor}>
                <TextInput
                  autoFocus
                  secureTextEntry
                  value={newCode}
                  keyboardType="number-pad"
                  maxLength={4}
                  onChangeText={(v) => setNewCode(v.replace(/\D/g, "").slice(0, 4))}
                  placeholder="4 digits"
                  placeholderTextColor={theme.colors.mutedForeground}
                  style={[
                    styles.textInput,
                    styles.codeInput,
                    { backgroundColor: theme.colors.card, color: theme.colors.foreground, borderColor: theme.colors.border },
                  ]}
                  accessibilityLabel="New code"
                />
                <TextInput
                  secureTextEntry
                  value={confirmCode}
                  keyboardType="number-pad"
                  maxLength={4}
                  onChangeText={(v) => setConfirmCode(v.replace(/\D/g, "").slice(0, 4))}
                  placeholder="Repeat"
                  placeholderTextColor={theme.colors.mutedForeground}
                  style={[
                    styles.textInput,
                    styles.codeInput,
                    { backgroundColor: theme.colors.card, color: theme.colors.foreground, borderColor: theme.colors.border },
                  ]}
                  accessibilityLabel="Repeat new code"
                />
                <View style={styles.codeActions}>
                  <Button label="Cancel" variant="ghost" disabled={savingCode} onPress={closeCodeEditor} />
                  <Button label={savingCode ? "Saving…" : "Save"} variant="ghost" disabled={savingCode} onPress={() => void saveCode()} />
                </View>
              </View>
            ) : (
              <Button
                label={settings.passcode ? "Change code" : "Set code"}
                variant="ghost"
                onPress={() => setEditingCode(true)}
              />
            )}
          </Row>
        </>
      )}
      <Divider />
      <Row
        title="AI suggestions"
        description="Optional sharing with Google Gemini, Groq, Google Search and Deezer. Review the details before enabling. Your journal still syncs to Supabase when this is off."
      >
        <Switch
          value={settings.aiSuggestionsEnabled}
          disabled={savingSharing}
          onValueChange={(v) => v ? setConfirmSharing(true) : void saveSharing(false)}
          trackColor={{ true: theme.colors.accent }}
        />
      </Row>

      <Divider />
      <ConfirmDialog
        visible={confirmSharing}
        title="Allow optional data sharing?"
        description={AI_SHARING_NOTICE}
        confirmLabel="Allow sharing"
        cancelLabel="Not now"
        onConfirm={() => void saveSharing(true)}
        onCancel={() => setConfirmSharing(false)}
      />
      <Row title="Export a copy" description="A clearly labelled text file with your preferences and every entry, newest first.">
        <Button label={exporting ? "Gathering…" : "Export"} variant="ghost" onPress={onExport} disabled={exporting} />
      </Row>

      <Divider />
      <SettingRow title="Recently deleted" value={deletedSummary} onPress={() => setShowDeleted(true)} />

      <Divider />
      <Text style={[styles.rowTitle, styles.deleteAllTitle, { color: theme.colors.foreground }]}>
        Delete all entries
      </Text>
      <Text style={[styles.rowDescription, { color: theme.colors.mutedForeground }]}>
        Immediate and permanent, including voice recordings.
      </Text>
      <Button
        label="Delete"
        variant="ghost"
        tone="destructive"
        onPress={onClearAllRequest}
        style={styles.deleteAllButton}
      />

      <Dialog
        visible={showDeleted}
        onClose={() => setShowDeleted(false)}
        title="Recently deleted"
        description="Removed for good after a week. Until then, you can bring an entry back."
      >
        {loading ? (
          <Text style={[styles.helperText, { color: theme.colors.mutedForeground }]}>Loading…</Text>
        ) : error ? (
          <Text style={[styles.errorText, { color: theme.colors.destructive }]}>
            Couldn't load these right now.
          </Text>
        ) : deletedEntries.length === 0 ? (
          <Text style={[styles.helperText, { color: theme.colors.mutedForeground }]}>Nothing here.</Text>
        ) : (
          deletedEntries.map((e) => (
            <View key={e.id} style={[styles.deletedRow, { borderColor: withAlpha(theme.colors.border, 0.7) }]}>
              <View style={styles.deletedRowText}>
                <Text style={[styles.deletedTitle, { color: theme.colors.foreground }]}>
                  {e.title ?? MODE_META[e.mode].label}
                </Text>
                <Text style={[styles.deletedDate, { color: theme.colors.mutedForeground }]}>
                  Deleted{" "}
                  {e.deletedAt &&
                    new Date(e.deletedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </Text>
              </View>
              <View style={styles.deletedActions}>
                <Button
                  label="Restore"
                  variant="ghost"
                  onPress={() => void handleRestore(e.id)}
                  disabled={pendingId === e.id}
                />
                <Button
                  label="Delete forever"
                  variant="ghost"
                  tone="destructive"
                  onPress={() => setPurgeTarget(e.id)}
                  disabled={pendingId === e.id}
                />
              </View>
            </View>
          ))
        )}

        {/* Nested inside this modal on purpose: iOS will not present a second
            modal from outside the one already on screen. */}
        <ConfirmDialog
          visible={purgeTarget !== null}
          title="Delete this entry for good?"
          description="This can't be undone, unlike the first delete."
          confirmLabel="Delete"
          cancelLabel="Keep it"
          destructive
          onCancel={() => setPurgeTarget(null)}
          onConfirm={() => {
            const id = purgeTarget;
            setPurgeTarget(null);
            if (id) void handlePurge(id);
          }}
        />
      </Dialog>
    </View>
  );
}

/* ---------------------------------------------------------------------- */
/* Screen                                                                  */
/* ---------------------------------------------------------------------- */

export default function SettingsScreen() {
  const { theme } = useTheme();
  const styles = useStyles(createStyles);
  const { settings } = useSettings();
  const { user } = useAuth();
  const { clearAll } = useEntries();
  const router = useRouter();
  const musicCount = settings.musicTastes.length + settings.musicArtists.length;

  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      // The whole history, not the pages loaded on screen: the file promises every entry.
      const all = await fetchAllEntries();
      const text = buildJournalExport(all, settings, user?.email);
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        toast("Sharing isn't available on this device.");
        return;
      }
      const file = new FileSystem.File(
        FileSystem.Paths.cache,
        `unravel-journal-${new Date().toISOString().slice(0, 10)}.txt`,
      );
      if (file.exists) file.delete();
      file.create();
      file.write(text);
      await Sharing.shareAsync(file.uri, { mimeType: "text/plain", dialogTitle: "Export your journal" });
    } catch (err) {
      console.error("Export failed", err);
      toast("That export didn't finish. Try again.");
    } finally {
      setExporting(false);
    }
  };

  const handleClearAll = async () => {
    setConfirmClearAll(false);
    try {
      await clearAll();
      toast("Everything deleted.");
    } catch (err) {
      console.error("Delete all entries failed", err);
      toast("That delete didn't finish. Your entries are still here.");
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled">
        <View>
          <PageTitle>Settings</PageTitle>
          <PageUnderline style={styles.underline} />
        </View>

        {/* A scannable list: each line shows where the setting stands, and opens the rest in a dialog. */}
        <View style={styles.section}>
          <AppearanceSection />
          <Divider />
          <ProfileSection />
          <Divider />
          <SettingRow title="Your setup" value="School, focus and interests" onPress={() => router.push("/setup?edit=1")} />
          <Divider />
          <SettingRow
            title="Music"
            value={musicCount ? `${musicCount} ${musicCount === 1 ? "preference" : "preferences"}` : "Optional"}
            onPress={() => router.push("/music")}
          />
          <Divider />
          <RemindersSection />
          <Divider />
          <AccountSection />
        </View>

        <PrivacySection
          exporting={exporting}
          onExport={() => void handleExport()}
          onClearAllRequest={() => setConfirmClearAll(true)}
        />

        <Text style={[styles.footerNote, { color: theme.colors.mutedForeground }]}>
          Your entries, voice recordings and preferences are stored in your own account and readable only by
          you.
        </Text>
      </ScrollView>

      <ConfirmDialog
        visible={confirmClearAll}
        title="Delete every entry?"
        description="Every entry and every voice recording will be erased from your account. This can't be undone."
        confirmLabel="Delete"
        cancelLabel="Keep them"
        destructive
        onCancel={() => setConfirmClearAll(false)}
        onConfirm={() => void handleClearAll()}
      />
    </SafeAreaView>
  );
}

const createStyles = (fonts: FontSet) => StyleSheet.create({
  safe: { flex: 1 },
  listContent: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 48 },
  underline: { marginTop: 12 },
  section: { marginTop: 32 },
  themeGrid: { marginTop: 16, flexDirection: "row", flexWrap: "wrap", gap: 10 },
  themeCard: { width: "31%", borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 12 },
  swatchRow: { flexDirection: "row", gap: 6 },
  swatchDot: { width: 18, height: 18, borderRadius: 999 },
  themeLabel: { marginTop: 10, fontFamily: fonts.body, fontSize: 13 },
  chipRow: { marginTop: 12, flexDirection: "row", flexWrap: "wrap", gap: 8 },
  dayRow: { marginTop: 12, flexDirection: "row", gap: 8 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16, paddingVertical: 16 },
  rowText: { flex: 1 },
  rowControl: { flexShrink: 0 },
  rowTitle: { fontFamily: fonts.body, fontSize: 15 },
  rowDescription: { marginTop: 4, fontFamily: fonts.body, fontSize: 13, lineHeight: 19 },
  settingRowValue: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 },
  settingRowValueText: { flexShrink: 1 },
  divider: { height: StyleSheet.hairlineWidth },
  subLabel: { marginTop: 20, fontFamily: fonts.bodySemiBold, fontSize: 14 },
  helperText: { marginTop: 4, fontFamily: fonts.body, fontSize: 12 },
  textInput: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, height: 44, fontFamily: fonts.body, fontSize: 14 },
  nameInput: { width: 150 },
  artistInputRow: { marginTop: 10, flexDirection: "row", gap: 8, alignItems: "center" },
  artistInput: { flex: 1 },
  checking: { marginTop: 8, fontFamily: fonts.body, fontSize: 12, lineHeight: 18 },
  noticeRow: { marginTop: 8, flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 12, rowGap: 4 },
  notice: { fontFamily: fonts.body, fontSize: 12, lineHeight: 18 },
  noticeAction: { fontFamily: fonts.body, fontSize: 12, lineHeight: 18, textDecorationLine: "underline" },
  timeInput: { width: 100, textAlign: "center" },
  fieldLabel: { marginTop: 12, fontFamily: fonts.body, fontSize: 13 },
  fullWidthInput: { marginTop: 6, width: "100%" },
  errorText: { marginTop: 10, fontFamily: fonts.body, fontSize: 13 },
  testStatus: { marginTop: -6, marginBottom: 14, fontFamily: fonts.body, fontSize: 13, lineHeight: 19 },
  mutedValue: { fontFamily: fonts.body, fontSize: 13 },
  guestBlock: { paddingVertical: 16 },
  guestSubmit: { marginTop: 14, alignSelf: "flex-start" },
  codeEditor: { alignItems: "flex-end", gap: 8 },
  codeInput: { width: 110, textAlign: "center", letterSpacing: 6 },
  codeActions: { flexDirection: "row", gap: 8 },
  devProgress: { marginTop: 10, flexDirection: "row", alignItems: "center", gap: 8 },
  deleteAllTitle: { marginTop: 16 },
  deleteAllButton: { marginTop: 10, alignSelf: "flex-start" },
  deletedRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 10,
  },
  deletedRowText: { flexShrink: 1 },
  deletedTitle: { fontFamily: fonts.body, fontSize: 14 },
  deletedDate: { marginTop: 2, fontFamily: fonts.body, fontSize: 12 },
  deletedActions: { flexDirection: "row", flexShrink: 0 },
  footerNote: { marginTop: 32, fontFamily: fonts.body, fontSize: 12, lineHeight: 18 },
});
