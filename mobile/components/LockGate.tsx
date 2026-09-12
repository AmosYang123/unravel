import { useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, AppState, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Lock } from "lucide-react-native";
import { Button } from "./ui";
import { useAuth } from "../lib/auth";
import { hashPasscode, needsPasscodeUpgrade, useSettings, verifyPasscode } from "@/lib/store";
import { useStyles, useTheme } from "@/theme/ThemeProvider";
import type { FontSet } from "@/theme/tokens";

/** Wrong attempts allowed before the next try has to wait. */
const FREE_ATTEMPTS = 2;
const BASE_DELAY_MS = 5000;
const MAX_DELAY_MS = 30000;

const delayFor = (wrongAttempts: number) => {
  if (wrongAttempts <= FREE_ATTEMPTS) return 0;
  return Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** (wrongAttempts - FREE_ATTEMPTS - 1));
};

/**
 * Ported from src/components/LockGate.tsx. Same delay curve, same "quietly
 * upgrade a legacy code" behaviour — swapped for RN's own TextInput/View
 * since there's no Radix/DOM here.
 */
export default function LockGate({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  const styles = useStyles(createStyles);
  const { settings, update } = useSettings();
  const { user, signOut } = useAuth();
  const [hasEntered, setHasEntered] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const [code, setCode] = useState("");
  const [checking, setChecking] = useState(false);
  const [checkingMessage, setCheckingMessage] = useState("Checking your code…");
  const [checkError, setCheckError] = useState(false);
  const [wrong, setWrong] = useState(false);
  const [waitSeconds, setWaitSeconds] = useState(0);
  const blockedUntil = useRef(0);
  const attempts = useRef(0);
  const updateRef = useRef(update);
  updateRef.current = update;

  const locked = settings.lockEnabled && settings.passcode.length > 0 && !unlocked;

  useEffect(() => {
    if (!checking) {
      setCheckingMessage("Checking your code…");
      return;
    }
    const unlocking = setTimeout(() => setCheckingMessage("Unlocking your journal…"), 900);
    const slower = setTimeout(() => setCheckingMessage("Still checking securely…"), 3000);
    return () => {
      clearTimeout(unlocking);
      clearTimeout(slower);
    };
  }, [checking]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (next !== "background") return;
      setUnlocked(false);
      setCode("");
      setChecking(false);
      setWrong(false);
      setCheckError(false);
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!locked || code.length !== 4) return;
    if (Date.now() < blockedUntil.current) return;
    let cancelled = false;

    void (async () => {
      const stored = settings.passcode;
      setChecking(true);
      setCheckError(false);
      let ok: boolean;
      try {
        ok = await verifyPasscode(code, stored);
      } catch {
        if (!cancelled) {
          setCheckError(true);
          setCode("");
          setChecking(false);
        }
        return;
      }
      if (cancelled) return;
      setChecking(false);
      if (ok) {
        setUnlocked(true);
        setCode("");
        setWrong(false);
        attempts.current = 0;
        if (needsPasscodeUpgrade(stored)) {
          try {
            await updateRef.current({ passcode: await hashPasscode(code) });
          } catch (err) {
            console.error("Passcode upgrade failed", err);
          }
        }
        return;
      }
      attempts.current += 1;
      setWrong(true);
      setCode("");
      const delay = delayFor(attempts.current);
      if (delay > 0) {
        blockedUntil.current = Date.now() + delay;
        setWaitSeconds(Math.ceil(delay / 1000));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code, settings.passcode, locked]);

  useEffect(() => {
    if (waitSeconds <= 0) return;
    const id = setInterval(() => {
      const left = Math.ceil((blockedUntil.current - Date.now()) / 1000);
      setWaitSeconds(left > 0 ? left : 0);
    }, 250);
    return () => clearInterval(id);
  }, [waitSeconds]);

  useEffect(() => {
    if (locked && !checking && waitSeconds === 0) inputRef.current?.focus();
  }, [locked, checking, waitSeconds]);

  useEffect(() => {
    if (!locked) setHasEntered(true);
  }, [locked]);

  const waiting = waitSeconds > 0;

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1, display: locked ? "none" : "flex" }} accessibilityElementsHidden={locked} importantForAccessibility={locked ? "no-hide-descendants" : "auto"}>
        {(!locked || hasEntered) && children}
      </View>
      {locked && <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]}>
      <View style={styles.body}>
        <Lock color={theme.colors.mutedForeground} size={20} strokeWidth={1.5} />
        <Text style={[styles.title, { color: theme.colors.foreground }]}>Enter your code</Text>
        {user?.email && (
          <Text style={[styles.account, { color: theme.colors.mutedForeground }]}>Signed in as {user.email}</Text>
        )}
        <TextInput
          ref={inputRef}
          autoFocus
          secureTextEntry
          value={code}
          keyboardType="number-pad"
          maxLength={4}
          editable={!waiting && !checking}
          onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 4))}
          style={[
            styles.input,
            {
              backgroundColor: theme.colors.card,
              color: theme.colors.foreground,
              borderColor: theme.colors.border,
            },
          ]}
          accessibilityLabel="Passcode"
        />
        {checking && (
          <View style={styles.progress} accessibilityLiveRegion="polite">
            <ActivityIndicator color={theme.colors.accent} />
            <Text style={[styles.message, styles.progressMessage, { color: theme.colors.mutedForeground }]}>
              {checkingMessage}
            </Text>
          </View>
        )}
        {checkError && <Text style={[styles.message, { color: theme.colors.destructive }]}>Couldn't check your code. Please try again.</Text>}
        {waiting ? (
          <Text
            style={[styles.message, { color: theme.colors.mutedForeground }]}
            accessibilityRole="text"
            accessibilityLiveRegion="polite"
          >
            Too many tries. Wait {waitSeconds}s.
          </Text>
        ) : (
          wrong && <Text style={[styles.message, { color: theme.colors.destructive }]}>Not quite. Try again.</Text>
        )}
        <Button
          label="Switch account"
          variant="ghost"
          disabled={checking}
          onPress={() => void signOut()}
          style={styles.switchAccount}
        />
      </View>
    </SafeAreaView>}
    </View>
  );
}

const createStyles = (fonts: FontSet) => StyleSheet.create({
  safe: { flex: 1 },
  body: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  title: { marginTop: 24, fontFamily: fonts.display, fontSize: 24 },
  account: { marginTop: 8, fontFamily: fonts.body, fontSize: 14 },
  input: {
    marginTop: 32,
    height: 56,
    width: 160,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    textAlign: "center",
    fontSize: 24,
    letterSpacing: 12,
  },
  message: {
    marginTop: 16,
    fontSize: 14,
  },
  progress: { marginTop: 16, flexDirection: "row", alignItems: "center", gap: 8 },
  progressMessage: { marginTop: 0 },
  switchAccount: { marginTop: 20 },
});
