import type { ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ resetPasswordForEmail: vi.fn(), signUp: vi.fn(), signInWithPassword: vi.fn(), resend: vi.fn(), signInAnonymously: vi.fn(), setSession: vi.fn(), updateUser: vi.fn(), signOut: vi.fn() }));
// The link that opened the app, swapped per test.
const link = vi.hoisted(() => ({ url: null as string | null }));
vi.mock("../mobile/node_modules/expo-linking", () => ({ useLinkingURL: () => link.url }));
vi.mock("../mobile/node_modules/react-native", () => {
  const Container = ({ children }: { children: ReactNode }) => <div>{children}</div>;
  // Text needs its own onPress forwarded (unlike the other containers) so a
  // nested <Text onPress={...}> inside the ack sentence can be clicked in tests.
  const TextContainer = ({ children, onPress }: { children: ReactNode; onPress?: () => void }) => (
    <span onClick={onPress}>{children}</span>
  );
  return {
    View: Container, Text: TextContainer, ScrollView: Container, KeyboardAvoidingView: Container,
    Platform: { OS: "ios" }, StyleSheet: { create: (v: unknown) => v }, ActivityIndicator: () => <span>Loading</span>,
    Pressable: ({ children, onPress, disabled, accessibilityLabel, accessibilityRole, accessibilityState }: { children: ReactNode; onPress: () => void; disabled?: boolean; accessibilityLabel?: string; accessibilityRole?: string; accessibilityState?: { checked?: boolean } }) => (
      <button disabled={disabled} onClick={onPress} aria-label={accessibilityLabel} role={accessibilityRole} aria-checked={accessibilityState?.checked}>{children}</button>
    ),
    TextInput: ({ value, onChangeText, accessibilityLabel }: { value: string; onChangeText: (v: string) => void; accessibilityLabel: string }) => <input aria-label={accessibilityLabel} value={value} onChange={(e) => onChangeText(e.target.value)} />,
  };
});
vi.mock("../mobile/node_modules/expo-router", () => ({ Link: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock("../mobile/node_modules/react-native-safe-area-context", () => ({ SafeAreaView: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("../mobile/node_modules/lucide-react-native", () => ({ Lock: () => null, Mail: () => null, Check: () => null }));
vi.mock("@/components/PasswordField", () => ({ default: ({ label, value, onChangeText }: { label: string; value: string; onChangeText: (v: string) => void }) => <input aria-label={label} value={value} onChange={(e) => onChangeText(e.target.value)} /> }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth } }));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ loading: false }), MIN_PASSWORD_LENGTH: 8, passwordMeetsRule: (v: string) => v.length >= 8 }));
vi.mock("@/lib/authCapabilities", () => ({ useAnonymousSignIn: () => true }));
vi.mock("@/theme/ThemeProvider", () => ({ useTheme: () => ({ theme: { colors: {} } }), useStyles: () => ({}) }));
import AuthScreen from "../mobile/app/auth";
import { passwordRecoveryUrl, setPasswordRecoveryPending, usePasswordRecoveryPending } from "../mobile/lib/passwordRecovery";
afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.useRealTimers(); });
beforeEach(() => { vi.clearAllMocks(); link.url = null; setPasswordRecoveryPending(false); });
/** Reports the flag app/_layout.tsx holds the auth screen up with. */
function Probe() {
  return <span>{usePasswordRecoveryPending() ? "recovery pending" : "recovery idle"}</span>;
}
const RECOVERY_LINK = "unravel://auth?mode=recovery#access_token=at-1&refresh_token=rt-1&type=recovery&expires_in=3600";
function openRecoveryLink() {
  link.url = RECOVERY_LINK;
  render(<><AuthScreen /><Probe /></>);
  fireEvent.change(screen.getByLabelText("New password"), { target: { value: "new-password-1" } });
  fireEvent.change(screen.getByLabelText("Repeat password"), { target: { value: "new-password-1" } });
}
function signIn() {
  render(<AuthScreen />);
  fireEvent.click(screen.getByText("I already have an account"));
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "person@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
}
function checkbox() {
  return screen.getByRole("checkbox", { name: "I've read the privacy policy" });
}
it("rejects absent, insecure and local recovery destinations", () => {
  for (const value of [undefined, "broken", "http://app.example.com/reset-password", "https://localhost/reset-password", "https://127.0.0.1/reset-password", "https://10.0.0.2/reset-password", "https://user:pass@app.example.com/reset-password"]) expect(passwordRecoveryUrl(value)).toBeNull();
  expect(passwordRecoveryUrl("https://app.example.com/reset-password")).toBe("https://app.example.com/reset-password");
});
it("reports missing recovery configuration without sending an email", async () => {
  vi.stubEnv("EXPO_PUBLIC_PASSWORD_RESET_URL", "");
  signIn();
  fireEvent.click(screen.getByText("Forgot password?"));
  await act(async () => fireEvent.click(screen.getByText("Send reset link")));
  expect(screen.getByText(/Password reset isn't available/)).toBeTruthy();
  expect(auth.resetPasswordForEmail).not.toHaveBeenCalled();
  expect((screen.getByText("Send reset link").closest("button") as HTMLButtonElement).disabled).toBe(false);
});
it("sends to the configured web recovery page and uses an enumeration-safe notice with cooldown", async () => {
  vi.stubEnv("EXPO_PUBLIC_PASSWORD_RESET_URL", "https://app.example.com/reset-password");
  auth.resetPasswordForEmail.mockResolvedValue({ error: null });
  signIn();
  fireEvent.click(screen.getByText("Forgot password?"));
  expect(screen.queryByLabelText("Password")).toBeNull();
  await act(async () => fireEvent.click(screen.getByText("Send reset link")));
  expect(auth.resetPasswordForEmail).toHaveBeenCalledWith("person@example.com", { redirectTo: "https://app.example.com/reset-password" });
  expect(screen.getByText(/If an account exists/)).toBeTruthy();
  expect((screen.getByText("Send reset link in 60s").closest("button") as HTMLButtonElement).disabled).toBe(true);
});
it.each(["signin", "guest", "signup", "recovery", "resend"])("recovers from a rejected %s request", async (mode) => {
  vi.stubEnv("EXPO_PUBLIC_PASSWORD_RESET_URL", "https://app.example.com/reset-password");
  signIn();
  const failure = new Error("offline");
  let label = "Sign in";
  if (mode === "guest") {
    fireEvent.click(checkbox());
    auth.signInAnonymously.mockRejectedValue(failure); label = "Continue as guest";
  } else if (mode === "signup") {
    fireEvent.click(screen.getByText("Create a new account"));
    fireEvent.change(screen.getByLabelText("Repeat password"), { target: { value: "password123" } });
    fireEvent.click(checkbox());
    auth.signUp.mockRejectedValue(failure); label = "Create account";
  } else if (mode === "recovery") {
    fireEvent.click(screen.getByText("Forgot password?"));
    auth.resetPasswordForEmail.mockRejectedValue(failure); label = "Send reset link";
  } else if (mode === "resend") {
    auth.signInWithPassword.mockResolvedValue({ error: { message: "Email not confirmed" } });
    await act(async () => fireEvent.click(screen.getByText("Sign in")));
    auth.resend.mockRejectedValue(failure); label = "Send it again";
  } else auth.signInWithPassword.mockRejectedValue(failure);
  await act(async () => fireEvent.click(screen.getByText(label)));
  expect(screen.getByText(/We couldn't connect/)).toBeTruthy();
  expect(screen.queryByText("Loading")).toBeNull();
  if (mode === "recovery") fireEvent.click(screen.getByText("Back to sign in"));
  expect((screen.getByText(mode === "signup" ? "Create account" : "Sign in").closest("button") as HTMLButtonElement).disabled).toBe(mode === "recovery");
});
it("keeps create account locked until the privacy box is ticked, then enables it", () => {
  render(<AuthScreen />);
  // Default mode is signup: the box starts unticked and blocks account creation.
  expect(checkbox().getAttribute("aria-checked")).toBe("false");
  expect((screen.getByText("Create account").closest("button") as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "person@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
  fireEvent.change(screen.getByLabelText("Repeat password"), { target: { value: "password123" } });
  expect((screen.getByText("Create account").closest("button") as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(checkbox());
  expect(checkbox().getAttribute("aria-checked")).toBe("true");
  expect((screen.getByText("Create account").closest("button") as HTMLButtonElement).disabled).toBe(false);
});
it("never gates sign-in on the privacy box, ticked or not", () => {
  signIn();
  expect(checkbox().getAttribute("aria-checked")).toBe("false");
  expect((screen.getByText("Sign in").closest("button") as HTMLButtonElement).disabled).toBe(false);
});
it("toggles the checkbox from the label words without navigating to the privacy policy", () => {
  render(<AuthScreen />);
  expect(checkbox().getAttribute("aria-checked")).toBe("false");
  fireEvent.click(screen.getByText("I've read the"));
  expect(checkbox().getAttribute("aria-checked")).toBe("true");
  fireEvent.click(screen.getByText("."));
  expect(checkbox().getAttribute("aria-checked")).toBe("false");
});
it("links to the privacy policy from the label without toggling the checkbox", () => {
  render(<AuthScreen />);
  const link = screen.getByText("privacy policy");
  expect(link.closest("a")?.getAttribute("href")).toBe("/privacy");
  fireEvent.click(link);
  expect(checkbox().getAttribute("aria-checked")).toBe("false");
});
it("keeps continue-as-guest locked until the privacy box is ticked, then enables it", () => {
  signIn();
  expect(checkbox().getAttribute("aria-checked")).toBe("false");
  expect((screen.getByText("Continue as guest").closest("button") as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(checkbox());
  expect((screen.getByText("Continue as guest").closest("button") as HTMLButtonElement).disabled).toBe(false);
});
it("accepts the app's own scheme as a recovery destination and refuses every other scheme", () => {
  expect(passwordRecoveryUrl("unravel://auth?mode=recovery")).toBe("unravel://auth?mode=recovery");
  for (const value of ["unravel:", "unravel://user:pass@auth", "exp://127.0.0.1:8081/--/auth", "myapp://auth", "http://app.example.com/reset-password"]) {
    expect(passwordRecoveryUrl(value)).toBeNull();
  }
});
it("opens the new-password step from a recovery link without signing anyone in", () => {
  openRecoveryLink();
  expect(screen.getByText("Choose a new password")).toBeTruthy();
  // The link's tokens are held, not applied: nothing is signed in yet.
  expect(auth.setSession).not.toHaveBeenCalled();
  expect(screen.getByText("recovery idle")).toBeTruthy();
});
it("saves the new password and only then releases the gate", async () => {
  auth.setSession.mockResolvedValue({ error: null });
  auth.updateUser.mockResolvedValue({ error: null });
  openRecoveryLink();
  await act(async () => fireEvent.click(screen.getByText("Save new password")));
  expect(auth.setSession).toHaveBeenCalledWith({ access_token: "at-1", refresh_token: "rt-1" });
  expect(auth.updateUser).toHaveBeenCalledWith({ password: "new-password-1" });
  expect(auth.signOut).not.toHaveBeenCalled();
  expect(screen.getByText("recovery idle")).toBeTruthy();
});
it("reports a refused password change as a failure and signs the recovery session back out", async () => {
  auth.setSession.mockResolvedValue({ error: null });
  auth.updateUser.mockResolvedValue({ error: { message: "New password should be different from the old password." } });
  auth.signOut.mockResolvedValue({ error: null });
  openRecoveryLink();
  await act(async () => fireEvent.click(screen.getByText("Save new password")));
  expect(screen.getByText(/haven't used on this account before/)).toBeTruthy();
  // Nothing changed, so nothing may stay signed in and the gate must not open.
  expect(auth.signOut).toHaveBeenCalled();
  expect(screen.getByText("recovery idle")).toBeTruthy();
  expect((screen.getByText("Save new password").closest("button") as HTMLButtonElement).disabled).toBe(false);
});
it("keeps the auth screen held while the password is in flight", async () => {
  let release: (v: { error: null }) => void = () => {};
  auth.setSession.mockResolvedValue({ error: null });
  auth.updateUser.mockReturnValue(new Promise((resolve) => { release = resolve; }));
  openRecoveryLink();
  await act(async () => { fireEvent.click(screen.getByText("Save new password")); });
  expect(screen.getByText("recovery pending")).toBeTruthy();
  await act(async () => { release({ error: null }); });
  expect(screen.getByText("recovery idle")).toBeTruthy();
});
it("says so when a reset link has expired instead of opening the password step", () => {
  link.url = "unravel://auth?mode=recovery#error=access_denied&error_code=otp_expired";
  render(<AuthScreen />);
  expect(screen.queryByText("Choose a new password")).toBeNull();
  expect(screen.getByText(/reset link has expired/)).toBeTruthy();
  expect(screen.getByText("Send reset link")).toBeTruthy();
});
it("signs the person in from a confirmation link", async () => {
  auth.setSession.mockResolvedValue({ error: null });
  link.url = "unravel://auth?mode=signup#access_token=at-2&refresh_token=rt-2&type=signup";
  await act(async () => { render(<AuthScreen />); });
  expect(auth.setSession).toHaveBeenCalledWith({ access_token: "at-2", refresh_token: "rt-2" });
  expect(auth.updateUser).not.toHaveBeenCalled();
});
it("leaves an ordinary deep link alone", () => {
  link.url = "unravel://write?mode=short";
  render(<AuthScreen />);
  expect(auth.setSession).not.toHaveBeenCalled();
  expect(screen.getByText("Make your private space")).toBeTruthy();
});
