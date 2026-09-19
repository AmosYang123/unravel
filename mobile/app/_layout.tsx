import { useEffect, useRef } from "react";
import { Stack, useRootNavigationState, useRouter } from "expo-router";
import { View, Text, Button } from "react-native";
import { StatusBar } from "expo-status-bar";
import * as Linking from "expo-linking";
import * as Notifications from "expo-notifications";
import * as SplashScreen from "expo-splash-screen";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "@/lib/auth";
import {
  REMINDER_KIND,
  reminderResponseKey,
  REMINDER_ROUTE,
  useLastReminderResponse,
  useReminderSync,
} from "../lib/notifications";
import { parseAuthLink, usePasswordRecoveryPending } from "../lib/passwordRecovery";
import { isAppLinkUrl } from "../lib/release-config";
import { loadUserData, useSettings } from "@/lib/store";
import { ThemeProvider, useTheme } from "@/theme/ThemeProvider";
import { useAppFonts } from "@/theme/useAppFonts";
import { ToastProvider } from "../components/ui";
import LockGate from "@/components/LockGate";

void SplashScreen.preventAutoHideAsync();

/**
 * The screens in app/ a deep link may land on. `auth` and `onboarding` are left
 * out — the gate decides when those are open, and an auth link is
 * `parseAuthLink`'s to handle — and so is anything naming no route here at all,
 * such as Expo Web's own page URL.
 */
const LINKABLE_ROUTES = new Set([
  "write", "entry", "breathe", "impact", "music", "setup", "privacy",
  "history", "insights", "reading", "settings",
]);

/** Sends signed-out people to the auth screen and signed-in people to the tabs. */
function AuthGate() {
  const { session, loading, signOut } = useAuth();
  const { settings, loading: settingsLoading, error } = useSettings();
  const { theme } = useTheme();
  const fontsLoaded = useAppFonts();
  const router = useRouter();
  const navigation = useRootNavigationState();

  // A reset link makes a session moments before the new password is saved. The
  // auth screen has to stay up until it is, or the gate would wave them into
  // the app with the old password still working.
  const recoveryPending = usePasswordRecoveryPending();

  // `recoveryPending` keeps the tree mounted through the profile load that the
  // recovery session starts, so the half-filled password form doesn't blank out.
  const ready = !loading && fontsLoaded && (!session || recoveryPending || !settingsLoading);

  // Asked once, on the first visit after signing in. `onboardedAt` is stamped
  // whether the questions were answered or skipped, so this never fires twice.
  // It waits for the profile to arrive so a slow load can't flash the questions
  // at someone who has already been through them.
  const needsOnboarding = !!session && !settingsLoading && !settings.onboardedAt;

  // `Stack.Protected` has no fallback of its own: a screen whose guard is false
  // is dropped from the navigator, and React Navigation then rebuilds the stack
  // around `initialRouteName` — or, with none given, around whichever screen
  // happens to be declared first, which is how an unguarded `privacy` came to
  // catch every closed route. So the landing screen is named here instead. Each
  // of the three matches the guard below it, which has to stay true of both:
  // React Navigation throws outright on an `initialRouteName` it can't find.
  const landing = !session || recoveryPending ? "auth" : needsOnboarding ? "onboarding" : "(tabs)";

  // The phone's own reminders follow the profile's rhythm. Nothing is scheduled
  // while signed out, and nothing is ever asked for here — permission is only
  // requested in Settings, when someone turns reminders on.
  useReminderSync(session && !settingsLoading ? settings : null);

  const lastReminderTap = useRef<string | null>(null);
  const reminderResponse = useLastReminderResponse();

  // A deep link (e.g. a tapped reminder's `unravel://entry/<id>`) can arrive
  // while signed out, before its screen even exists behind the auth guard.
  // Remembered here and replayed once sign-in and onboarding are both clear,
  // so the auth gate doesn't swallow the destination.
  const pendingHref = useRef<string | null>(null);
  const linkedUrl = Linking.useLinkingURL();

  useEffect(() => {
    if (!linkedUrl || session) return;
    // Confirmation and reset links are consumed by the auth screen itself.
    // Replaying one after sign-in would land on a screen the gate has closed.
    if (parseAuthLink(linkedUrl)) return;
    // Only our own scheme carries a destination. On Expo Web `useLinkingURL()`
    // hands back the page the app is already showing — `http://localhost:8081/`
    // — which is where it launched, not somewhere it was asked to go.
    if (!isAppLinkUrl(linkedUrl)) return;
    // A two-slash custom-scheme link (e.g. `unravel://write?mode=short`) puts
    // its first route segment in `hostname`, not `path` — there's no real host
    // for a scheme like this — so both are joined back into one route.
    const { hostname, path, queryParams } = Linking.parse(linkedUrl);
    const segment = [hostname, path].filter(Boolean).join("/");
    // The whole thing comes from an external URL, so it's treated as opaque
    // rather than trusted as-is: a leading slash or an embedded scheme could
    // otherwise turn the replayed href into an absolute or scheme-relative
    // navigation instead of a same-app route.
    if (!segment || segment.startsWith("/") || segment.includes("://")) return;
    // And it has to name a screen this app has, or the replay would drop
    // someone on the not-found page the moment they finished signing in. The
    // route is read off the joined segment rather than `hostname`, which is
    // empty for a three-slash link.
    if (!LINKABLE_ROUTES.has(segment.split("/")[0] ?? "")) return;
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(queryParams ?? {})) {
      for (const v of Array.isArray(value) ? value : [value]) {
        if (v != null) query.append(key, v);
      }
    }
    const search = query.toString();
    pendingHref.current = `/${segment}${search ? `?${search}` : ""}`;
  }, [linkedUrl, session]);

  useEffect(() => {
    if (!ready || !session || needsOnboarding || recoveryPending || !pendingHref.current) return;
    const href = pendingHref.current;
    pendingHref.current = null;
    router.replace(href);
  }, [ready, session, needsOnboarding, recoveryPending, router]);

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  // Tapping a reminder opens the short check-in, the same place the emailed
  // reminder points at. Handled once per notification, not once per render.
  useEffect(() => {
    if (!navigation?.key || !ready || error || !session || needsOnboarding || !reminderResponse) return;
    if (reminderResponse.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const request = reminderResponse.notification.request;
    const responseKey = reminderResponseKey(reminderResponse);
    if (lastReminderTap.current === responseKey) return;
    const data: unknown = request.content.data;
    const kind =
      typeof data === "object" && data !== null && "kind" in data
        ? (data as { kind: unknown }).kind
        : undefined;
    if (kind !== REMINDER_KIND) return;
    lastReminderTap.current = responseKey;
    // Forgotten once acted on, so the next cold start doesn't reopen the
    // check-in on the strength of a tap from days ago.
    Notifications.clearLastNotificationResponse();
    router.push(REMINDER_ROUTE);
  }, [navigation?.key, ready, error, session, needsOnboarding, reminderResponse, router]);

  if (!ready) return null;
  if (session && error) return (
    <View style={{ flex: 1, justifyContent: "center", padding: 24, backgroundColor: theme.colors.background }}>
      <Text style={{ color: theme.colors.foreground }}>Couldn't load your account. Please try again.</Text>
      <Button title="Try again" onPress={() => void loadUserData(session.user.id)} />
      <Button title="Sign out" onPress={() => void signOut()} />
    </View>
  );

  return (
    <>
      <StatusBar style={theme.dark ? "light" : "dark"} />
      {/* Still "signed-out" mid-recovery: remounting on the new id would drop
          the half-filled password form. The real id arrives when it clears. */}
      <LockGate key={recoveryPending ? "signed-out" : session?.user.id ?? "signed-out"}>
        <Stack
          initialRouteName={landing}
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: theme.colors.background },
            animation: "ios_from_right",
            gestureEnabled: true,
          }}
        >
          <Stack.Screen name="privacy" />
          <Stack.Screen name="+not-found" />
          <Stack.Protected guard={!session || recoveryPending}>
            <Stack.Screen name="auth" options={{ animation: "none", gestureEnabled: false }} />
          </Stack.Protected>
          <Stack.Protected guard={needsOnboarding && !recoveryPending}>
            <Stack.Screen name="onboarding" options={{ animation: "none", gestureEnabled: false }} />
          </Stack.Protected>
          <Stack.Protected guard={!!session && !needsOnboarding && !recoveryPending}>
            <Stack.Screen name="(tabs)" options={{ animationTypeForReplace: "pop" }} />
            <Stack.Screen name="write" />
            <Stack.Screen name="entry/[id]" />
            <Stack.Screen name="breathe" />
            <Stack.Screen name="impact" />
            <Stack.Screen name="music" />
            <Stack.Screen name="setup" />
          </Stack.Protected>
        </Stack>
      </LockGate>
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <ToastProvider>
            <AuthGate />
          </ToastProvider>
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
