import { useEffect } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ appState: undefined as ((next: string) => void) | undefined, verify: vi.fn(), signOut: vi.fn() }));
vi.mock("../mobile/node_modules/react-native", async () => {
  const React = await import("react");
  return {
    AppState: { addEventListener: (_event: string, fn: (next: string) => void) => { state.appState = fn; return { remove: vi.fn() }; } },
    ActivityIndicator: () => <span aria-label="Checking" />,
    StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 },
    View: ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => <div style={Array.isArray(style) ? Object.assign({}, ...style) : style}>{children}</div>,
    Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
    TextInput: React.forwardRef<HTMLInputElement, { value: string; onChangeText: (value: string) => void; editable: boolean }>((props, ref) => <input aria-label="Passcode" ref={ref} value={props.value} disabled={!props.editable} onChange={(e) => props.onChangeText(e.target.value)} />),
  };
});
vi.mock("../mobile/node_modules/react-native-safe-area-context", () => ({ SafeAreaView: ({ children }: { children: React.ReactNode }) => <section>{children}</section> }));
vi.mock("../mobile/node_modules/lucide-react-native", () => ({ Lock: () => null }));
vi.mock("../mobile/components/ui", () => ({ Button: ({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) => <button disabled={disabled} onClick={onPress}>{label}</button> }));
vi.mock("../mobile/lib/auth", () => ({ useAuth: () => ({ user: { email: "person@example.com" }, signOut: state.signOut }) }));
vi.mock("@/theme/ThemeProvider", () => ({ useTheme: () => ({ theme: { colors: {} } }), useStyles: () => ({}) }));
vi.mock("@/lib/store", () => ({
  useSettings: () => ({ settings: { lockEnabled: true, passcode: "hash" }, update: vi.fn() }),
  verifyPasscode: state.verify, needsPasscodeUpgrade: () => false, hashPasscode: vi.fn(),
}));
import LockGate from "../mobile/components/LockGate";
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it("keeps the journal unmounted until unlock, then preserves the editor when relocking", async () => {
  const mount = vi.fn();
  const unmount = vi.fn();
  function Editor() {
    useEffect(() => { mount(); return unmount; }, []);
    return <p>Unsaved voice memo</p>;
  }
  state.verify.mockResolvedValue(true);
  render(<LockGate><Editor /></LockGate>);
  expect(mount).not.toHaveBeenCalled();
  await act(async () => fireEvent.change(screen.getByLabelText("Passcode"), { target: { value: "1234" } }));
  expect(mount).toHaveBeenCalledTimes(1);
  act(() => state.appState?.("background"));
  expect(screen.getByLabelText("Passcode")).toBeTruthy();
  expect(screen.getByText("Unsaved voice memo").parentElement?.style.display).toBe("none");
  expect(unmount).not.toHaveBeenCalled();
  await act(async () => fireEvent.change(screen.getByLabelText("Passcode"), { target: { value: "1234" } }));
  expect(mount).toHaveBeenCalledTimes(1);
  expect(screen.getByText("Unsaved voice memo").parentElement?.style.display).toBe("flex");
});

it("shows the account, progress, and account switch while checking", async () => {
  let finish: ((value: boolean) => void) | undefined;
  state.verify.mockImplementation(() => new Promise<boolean>((resolve) => { finish = resolve; }));
  render(<LockGate><p>Journal</p></LockGate>);
  expect(screen.getByText("Signed in as person@example.com")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Passcode"), { target: { value: "1234" } });
  expect(await screen.findByText("Checking your code…")).toBeTruthy();
  expect((screen.getByRole("button", { name: "Switch account" }) as HTMLButtonElement).disabled).toBe(true);
  await act(async () => finish?.(true));
});

it("switches accounts from the lock screen", () => {
  render(<LockGate><p>Journal</p></LockGate>);
  fireEvent.click(screen.getByRole("button", { name: "Switch account" }));
  expect(state.signOut).toHaveBeenCalledOnce();
});
