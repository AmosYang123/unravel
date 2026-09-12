import type { ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ resetPasswordForEmail: vi.fn(), signUp: vi.fn(), signInWithPassword: vi.fn(), resend: vi.fn(), signInAnonymously: vi.fn() }));
vi.mock("../mobile/node_modules/react-native", () => {
  const Container = ({ children }: { children: ReactNode }) => <div>{children}</div>;
  return {
    View: Container, Text: Container, ScrollView: Container, KeyboardAvoidingView: Container,
    Platform: { OS: "ios" }, StyleSheet: { create: (v: unknown) => v }, ActivityIndicator: () => <span>Loading</span>,
    Pressable: ({ children, onPress, disabled }: { children: ReactNode; onPress: () => void; disabled?: boolean }) => <button disabled={disabled} onClick={onPress}>{children}</button>,
    TextInput: ({ value, onChangeText, accessibilityLabel }: { value: string; onChangeText: (v: string) => void; accessibilityLabel: string }) => <input aria-label={accessibilityLabel} value={value} onChange={(e) => onChangeText(e.target.value)} />,
  };
});
vi.mock("../mobile/node_modules/expo-router", () => ({ Link: ({ children }: { children: ReactNode }) => <a>{children}</a> }));
vi.mock("../mobile/node_modules/react-native-safe-area-context", () => ({ SafeAreaView: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("../mobile/node_modules/lucide-react-native", () => ({ Lock: () => null, Mail: () => null, Check: () => null }));
vi.mock("@/components/PasswordField", () => ({ default: ({ label, value, onChangeText }: { label: string; value: string; onChangeText: (v: string) => void }) => <input aria-label={label} value={value} onChange={(e) => onChangeText(e.target.value)} /> }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth } }));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ loading: false }), MIN_PASSWORD_LENGTH: 8, passwordMeetsRule: (v: string) => v.length >= 8 }));
vi.mock("@/lib/authCapabilities", () => ({ useAnonymousSignIn: () => true }));
vi.mock("@/theme/ThemeProvider", () => ({ useTheme: () => ({ theme: { colors: {} } }), useStyles: () => ({}) }));
import AuthScreen from "../mobile/app/auth";
import { passwordRecoveryUrl } from "../mobile/lib/passwordRecovery";
afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.useRealTimers(); });
beforeEach(() => { vi.clearAllMocks(); });
function signIn() {
  render(<AuthScreen />);
  fireEvent.click(screen.getByText("I already have an account"));
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "person@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
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
  if (mode === "guest") { auth.signInAnonymously.mockRejectedValue(failure); label = "Continue as guest"; }
  else if (mode === "signup") {
    fireEvent.click(screen.getByText("Create a new account"));
    fireEvent.change(screen.getByLabelText("Repeat password"), { target: { value: "password123" } });
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
