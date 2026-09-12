import { Link } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
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
import { Check, Lock, Mail } from "lucide-react-native";
import PasswordField from "@/components/PasswordField";
import { supabase } from "@/integrations/supabase/client";
import { MIN_PASSWORD_LENGTH, passwordMeetsRule, useAuth } from "@/lib/auth";
import { useAnonymousSignIn } from "@/lib/authCapabilities";
import { passwordRecoveryUrl } from "../lib/passwordRecovery";
import { useStyles, useTheme } from "@/theme/ThemeProvider";
import type { FontSet } from "@/theme/tokens";

type Mode = "signin" | "signup" | "sent" | "recovery";

/**
 * How long the resend button stays closed. Supabase counts confirmation emails
 * per address on its own side and answers a burst with a rate-limit error, so
 * this exists to stop us knocking at all rather than to find the limit by
 * hitting it. It starts running the moment signup sends the first email.
 */
const RESEND_COOLDOWN_SECONDS = 60;

// Where the "confirm your email" link should land. Mobile has no origin of
// its own to fall back to, so this must be set for confirmation emails to
// go anywhere useful.
const CONFIRMATION_URL = process.env.EXPO_PUBLIC_CONFIRMATION_URL;

const messageOf = (err: unknown): string =>
  typeof err === "object" && err !== null && "message" in err && typeof err.message === "string"
    ? err.message.toLowerCase()
    : "";

const isUnconfirmed = (err: unknown): boolean => messageOf(err).includes("not confirmed");

export default function AuthScreen() {
  const { theme } = useTheme();
  const styles = useStyles(createStyles);
  const { loading: authLoading } = useAuth();
  // Only offered when the project actually accepts anonymous sign-ins.
  const guestEnabled = useAnonymousSignIn();
  const [mode, setMode] = useState<Mode>("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // The address the confirmation email actually went to, kept apart from the
  // input so editing the field can't quietly rewrite what we claim was sent.
  const [sentTo, setSentTo] = useState("");
  // Set when a sign-in is refused for want of a confirmation, so the offer to
  // resend appears on the sign-in form itself rather than a generic error.
  const [needsConfirming, setNeedsConfirming] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const passwordOk = passwordMeetsRule(password);
  const canSubmit =
    email.trim().length > 3 &&
    (mode === "recovery" || (password.length > 0 &&
    (mode === "signin" || (passwordOk && password === confirm))));

  const resend = useCallback(async () => {
    const address = (sentTo || email).trim();
    if (!address || cooldown > 0 || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    // Closed before the call, not after, so a slow network can't buy a second press.
    setCooldown(RESEND_COOLDOWN_SECONDS);
    try {
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: address,
      options: CONFIRMATION_URL ? { emailRedirectTo: CONFIRMATION_URL } : undefined,
    });
    if (error) {
      console.error("resend failed", error);
      setError(
        messageOf(error).includes("rate") || messageOf(error).includes("security")
          ? "Too many just now. Wait a minute and try again."
          : "We couldn't send that just now. Try again in a moment.",
      );
    } else {
      setNotice(`Sent again to ${address}.`);
    }
    } catch {
      setError("We couldn't connect. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }, [sentTo, email, cooldown, busy]);

  // The signed-in redirect is handled by the gate in app/_layout.tsx.
  const submit = async () => {
    if (!canSubmit || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    setNeedsConfirming(false);

    try {
    if (mode === "recovery") {
      const redirectTo = passwordRecoveryUrl(process.env.EXPO_PUBLIC_PASSWORD_RESET_URL);
      if (!redirectTo) {
        setError("Password reset isn't available in this build. Please contact support.");
        return;
      }
      if (cooldown > 0) return;
      setCooldown(RESEND_COOLDOWN_SECONDS);
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
      if (error) setError("We couldn't send a reset link just now. Wait a minute and try again.");
      else setNotice("If an account exists for that email, you'll receive a reset link. Open it in your browser to choose a new password, then return here to sign in.");
    } else if (mode === "signup") {
      const address = email.trim();
      const { data, error } = await supabase.auth.signUp({
        email: address,
        password,
        options: CONFIRMATION_URL ? { emailRedirectTo: CONFIRMATION_URL } : undefined,
      });
      if (error) setError(error.message);
      // An address that already has a confirmed account gets a 200 and a
      // hollowed-out user back, never an email — Supabase won't confirm to a
      // stranger that the address is taken. The empty `identities` array is the
      // only tell. Promising an email that will never arrive is worse than
      // saying so, so this sends them to sign in instead.
      else if (data.user && data.user.identities?.length === 0) {
        setPassword("");
        setConfirm("");
        setMode("signin");
        setNotice("That address already has an account. Sign in below.");
      } else if (!data.session) {
        // Confirmation is on. Stay on this screen and wait for them. If it were
        // ever switched off, signUp hands back a session instead and the gate
        // takes them straight in with nothing to check.
        setSentTo(address);
        setCooldown(RESEND_COOLDOWN_SECONDS);
        setMode("sent");
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error && isUnconfirmed(error)) {
        // Not a wrong password. Say the actual reason and put the fix here.
        console.error("auth error", error);
        setSentTo(email.trim());
        setNeedsConfirming(true);
      } else if (error) {
        setError(
          messageOf(error).includes("invalid login")
            ? "That email and password don't match an account."
            : error.message,
        );
      }
    }
    } catch {
      setError("We couldn't connect. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  // Anonymous sign-in is a project setting and is off by default. That failure
  // is not a user mistake, so it gets its own plain line.
  const continueAsGuest = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
    const { error } = await supabase.auth.signInAnonymously();
    if (error) {
      setError(
        messageOf(error).includes("anonymous")
          ? "Guest journals aren't switched on for this app yet. Create an account to carry on."
          : "Something went wrong. Try again in a moment.",
      );
    }
    } catch {
      setError("We couldn't connect. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const inputStyle = [
    styles.input,
    {
      backgroundColor: theme.colors.card,
      borderColor: theme.colors.border,
      color: theme.colors.foreground,
    },
  ];

  const resendLabel =
    cooldown > 0 ? `Send it again in ${cooldown}s` : busy ? "Sending…" : "Send it again";

  /** Leaves the address in place and drops the password, so only one box is left to fill. */
  const goToSignIn = () => {
    setMode("signin");
    setPassword("");
    setConfirm("");
    setError(null);
    setNotice(null);
    setNeedsConfirming(false);
  };

  if (mode === "sent") {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Mail color={theme.colors.mutedForeground} size={20} strokeWidth={1.5} />

          <Text style={[styles.title, { color: theme.colors.foreground }]}>Check your inbox</Text>
          <Text style={[styles.lede, { color: theme.colors.mutedForeground }]}>
            We sent a confirmation link to {sentTo}. Open it, then come back and sign in.
          </Text>
          <Text style={[styles.lede, { color: theme.colors.mutedForeground }]}>
            Nothing yet? It can take a minute, and it sometimes lands in spam.
          </Text>

          {error && <Text style={[styles.message, { color: theme.colors.destructive }]}>{error}</Text>}
          {notice && <Text style={[styles.message, { color: theme.colors.mutedForeground }]}>{notice}</Text>}

          <Pressable
            onPress={resend}
            disabled={cooldown > 0 || busy}
            accessibilityRole="button"
            style={[
              styles.guestButton,
              { borderColor: theme.colors.border, marginTop: 24, opacity: cooldown > 0 || busy ? 0.5 : 1 },
            ]}
          >
            <Text style={[styles.buttonText, { color: theme.colors.foreground }]}>{resendLabel}</Text>
          </Pressable>

          <Pressable
            onPress={goToSignIn}
            accessibilityRole="button"
            style={[styles.button, { backgroundColor: theme.colors.primary, marginTop: 12 }]}
          >
            <Text style={[styles.buttonText, { color: theme.colors.primaryForeground }]}>
              I've confirmed — sign me in
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              setMode("signup");
              setPassword("");
              setConfirm("");
              setError(null);
              setNotice(null);
            }}
          >
            <Text style={[styles.switch, { color: theme.colors.mutedForeground }]}>
              Use a different address
            </Text>
          </Pressable>
          <Link href="/privacy" style={{ color: theme.colors.foreground, textDecorationLine: "underline", marginTop: 20 }}>Privacy policy</Link>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]}>
      <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Lock color={theme.colors.mutedForeground} size={20} strokeWidth={1.5} />

          <Text style={[styles.title, { color: theme.colors.foreground }]}>
            {mode === "recovery" ? "Reset your password" : mode === "signup" ? "Make your private space" : "Welcome back"}
          </Text>
          <Text style={[styles.lede, { color: theme.colors.mutedForeground }]}>
            {mode === "signup"
              ? "Your entries, recordings and preferences sync to your private account using Supabase. Optional AI sharing is off until you allow it."
              : mode === "recovery" ? "Enter your email to request a password reset link." : "Sign in to reach your entries and preferences."}
          </Text>

          <Text style={[styles.label, { color: theme.colors.mutedForeground }]}>Email</Text>
          <TextInput
            style={inputStyle}
            value={email}
            accessibilityLabel="Email"
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholderTextColor={theme.colors.mutedForeground}
          />

          {mode !== "recovery" && <PasswordField
            label="Password"
            value={password}
            onChangeText={setPassword}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            textContentType={mode === "signup" ? "newPassword" : "password"}
          />}

          {mode === "signup" && (
            <>
              <View style={[styles.rules, { backgroundColor: theme.colors.secondary }]}>
                <View style={styles.rule}>
                  <Check
                    color={passwordOk ? theme.colors.foreground : theme.colors.mutedForeground}
                    size={14}
                    strokeWidth={2}
                    opacity={passwordOk ? 1 : 0.3}
                  />
                  <Text
                    style={[
                      styles.ruleText,
                      { color: passwordOk ? theme.colors.foreground : theme.colors.mutedForeground },
                    ]}
                  >
                    {`At least ${MIN_PASSWORD_LENGTH} characters`}
                  </Text>
                </View>
              </View>

              <PasswordField
                label="Repeat password"
                value={confirm}
                onChangeText={setConfirm}
                autoComplete="new-password"
                textContentType="newPassword"
              />
              {confirm.length > 0 && confirm !== password && (
                <Text style={[styles.error, { color: theme.colors.destructive }]}>
                  These two don't match yet.
                </Text>
              )}
            </>
          )}

          {needsConfirming && (
            <View style={[styles.rules, { backgroundColor: theme.colors.secondary }]}>
              <Text style={[styles.ruleText, { color: theme.colors.foreground, fontSize: 14, lineHeight: 21 }]}>
                That address hasn't been confirmed yet. Open the link we emailed to {sentTo}, then
                sign in here.
              </Text>
              <Pressable
                onPress={resend}
                disabled={cooldown > 0 || busy}
                accessibilityRole="button"
                style={[
                  styles.guestButton,
                  { borderColor: theme.colors.border, marginTop: 12, opacity: cooldown > 0 || busy ? 0.5 : 1 },
                ]}
              >
                <Text style={[styles.buttonText, { color: theme.colors.foreground }]}>{resendLabel}</Text>
              </Pressable>
            </View>
          )}

          {error && <Text style={[styles.message, { color: theme.colors.destructive }]}>{error}</Text>}
          {notice && <Text style={[styles.message, { color: theme.colors.mutedForeground }]}>{notice}</Text>}

          <Pressable
            onPress={submit}
            disabled={!canSubmit || busy || authLoading || (mode === "recovery" && cooldown > 0)}
            accessibilityRole="button"
            style={[
              styles.button,
              {
                backgroundColor: theme.colors.primary,
                opacity: !canSubmit || busy || authLoading ? 0.5 : 1,
              },
            ]}
          >
            {busy && <ActivityIndicator color={theme.colors.primaryForeground} size="small" />}
            <Text style={[styles.buttonText, { color: theme.colors.primaryForeground }]}>
              {mode === "recovery" ? cooldown > 0 ? `Send reset link in ${cooldown}s` : "Send reset link" : mode === "signup" ? "Create account" : "Sign in"}
            </Text>
          </Pressable>

          {mode === "signin" && (
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => {
              setMode("recovery");
              setPassword("");
              setConfirm("");
              setError(null);
              setNotice(null);
              setNeedsConfirming(false);
            }}>
              <Text style={[styles.switch, { color: theme.colors.foreground }]}>Forgot password?</Text>
            </Pressable>
          )}
          {mode === "recovery" && (
            <Pressable accessibilityRole="button" disabled={busy} onPress={goToSignIn}>
              <Text style={[styles.switch, { color: theme.colors.foreground }]}>Back to sign in</Text>
            </Pressable>
          )}

          {mode === "signin" && guestEnabled && (
            <View style={[styles.guest, { borderTopColor: theme.colors.border }]}>
              <Pressable
                onPress={continueAsGuest}
                disabled={busy || authLoading}
                accessibilityRole="button"
                style={[
                  styles.guestButton,
                  {
                    borderColor: theme.colors.border,
                    opacity: busy || authLoading ? 0.5 : 1,
                  },
                ]}
              >
                <Text style={[styles.buttonText, { color: theme.colors.foreground }]}>
                  Continue as guest
                </Text>
              </Pressable>
              <Text style={[styles.guestNote, { color: theme.colors.mutedForeground }]}>
                A guest journal has no email attached, so it stays on this device and can't be
                brought back if you lose access. You can add an email later in settings.
              </Text>
            </View>
          )}

          <Pressable
            onPress={() => {
              setMode(mode === "signup" ? "signin" : "signup");
              setError(null);
              setNotice(null);
              setNeedsConfirming(false);
            }}
            accessibilityLabel={mode === "signup" ? "I already have an account" : "Create a new account"}
            style={[styles.accountSwitch, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}
          >
            <Text style={[styles.accountSwitchText, { color: theme.colors.foreground }]}>
              {mode === "signup" ? "I already have an account" : "Create a new account"}
            </Text>
          </Pressable>
          <Link href="/privacy" style={{ color: theme.colors.foreground, textDecorationLine: "underline", marginTop: 20 }}>Privacy policy</Link>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (fonts: FontSet) => StyleSheet.create({
  safe: { flex: 1 },
  scroll: { paddingHorizontal: 24, paddingVertical: 40, maxWidth: 420, width: "100%", alignSelf: "center" },
  title: { fontFamily: fonts.display, fontSize: 28, lineHeight: 34, marginTop: 24 },
  lede: { fontFamily: fonts.body, fontSize: 14, lineHeight: 22, marginTop: 12 },
  label: { fontFamily: fonts.body, fontSize: 14, marginTop: 20 },
  input: {
    fontFamily: fonts.body,
    fontSize: 16,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    marginTop: 8,
  },
  rules: { borderRadius: 12, padding: 16, marginTop: 20, gap: 6 },
  rule: { flexDirection: "row", alignItems: "center", gap: 8 },
  ruleText: { fontFamily: fonts.body, fontSize: 12 },
  error: { fontFamily: fonts.body, fontSize: 12, marginTop: 8 },
  message: { fontFamily: fonts.body, fontSize: 14, marginTop: 16 },
  button: {
    height: 48,
    borderRadius: 999,
    marginTop: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  buttonText: { fontFamily: fonts.bodySemiBold, fontSize: 15 },
  guest: { marginTop: 24, paddingTop: 24, borderTopWidth: 1 },
  guestButton: {
    height: 48,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  guestNote: { fontFamily: fonts.body, fontSize: 12, lineHeight: 18, marginTop: 12 },
  switch: { fontFamily: fonts.body, fontSize: 14, marginTop: 24, textDecorationLine: "underline" },
  accountSwitch: { height: 48, borderRadius: 999, borderWidth: 1, marginTop: 24, alignItems: "center", justifyContent: "center" },
  accountSwitchText: { fontFamily: fonts.bodySemiBold, fontSize: 15 },
});
