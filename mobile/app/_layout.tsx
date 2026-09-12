import { useEffect, useRef } from "react";
import { Stack, useRootNavigationState, useRouter } from "expo-router";
import { View, Text, Button } from "react-native";
import { StatusBar } from "expo-status-bar";
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
} from "@/lib/notifications";
import { loadUserData, useSettings } from "@/lib/store";
import { ThemeProvider, useTheme } from "@/theme/ThemeProvider";
import { useAppFonts } from "@/theme/useAppFonts";
import { ToastProvider } from "@/components/ui";
import LockGate from "@/components/LockGate";

void SplashScreen.preventAutoHideAsync();

/** Sends signed-out people to the auth screen and signed-in people to the tabs. */
function AuthGate() {
  const { session, loading, signOut } = useAuth();
  const { settings, loading: settingsLoading, error } = useSettings();
  const { theme } = useTheme();
  const fontsLoaded = useAppFonts();
  const router = useRouter();
  const navigation = useRootNavigationState();

  const ready = !loading && fontsLoaded && (!session || !settingsLoading);

  // Asked once, on the first visit after signing in. `onboardedAt` is stamped
  // whether the questions were answered or skipped, so this never fires twice.
  // It waits for the profile to arrive so a slow load can't flash the questions
  // at someone who has already been through them.
  const needsOnboarding = !!session && !settingsLoading && !settings.onboardedAt;

  // The phone's own reminders follow the profile's rhythm. Nothing is scheduled
  // while signed out, and nothing is ever asked for here — permission is only
  // requested in Settings, when someone turns reminders on.
  useReminderSync(session && !settingsLoading ? settings : null);

  const lastReminderTap = useRef<string | null>(null);
  const reminderResponse = useLastReminderResponse();

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
      <LockGate key={session?.user.id ?? "signed-out"}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: theme.colors.background },
            animation: "ios_from_right",
            gestureEnabled: true,
          }}
        >
          <Stack.Screen name="privacy" />
          <Stack.Protected guard={!session}>
            <Stack.Screen name="auth" options={{ animation: "none", gestureEnabled: false }} />
          </Stack.Protected>
          <Stack.Protected guard={needsOnboarding}>
            <Stack.Screen name="onboarding" options={{ animation: "none", gestureEnabled: false }} />
          </Stack.Protected>
          <Stack.Protected guard={!!session && !needsOnboarding}>
            <Stack.Screen name="(tabs)" options={{ animationTypeForReplace: "pop" }} />
            <Stack.Screen name="write" />
            <Stack.Screen name="entry/[id]" />
            <Stack.Screen name="breathe" />
            <Stack.Screen name="impact" />
            <Stack.Screen name="music" />
            <Stack.Screen name="setup" />
            <Stack.Screen name="+not-found" />
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
