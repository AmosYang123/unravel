import { useEffect } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ appState: undefined as ((next: string) => void) | undefined, verify: vi.fn(), signOut: vi.fn(), update: vi.fn(), upgrade: false, storage: new Map<string, string>() }));
vi.mock("../mobile/node_modules/@react-native-async-storage/async-storage", () => ({ default: {
  getItem: async (key: string) => state.storage.get(key) ?? null,
  setItem: async (key: string, value: string) => void state.storage.set(key, value),
  removeItem: async (key: string) => void state.storage.delete(key),
} }));
vi.mock("../mobile/node_modules/expo-crypto", async () => {
  const { webcrypto } = await import("node:crypto");
  return { getRandomValues: (array: Uint8Array) => webcrypto.getRandomValues(array) };
});
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
  useSettings: () => ({ settings: { lockEnabled: true, passcode: "hash" }, update: state.update }),
  verifyPasscode: state.verify, needsPasscodeUpgrade: () => state.upgrade, hashPasscode: async (code: string) => `hashed:${code}`,
}));
import LockGate, { LOCK_GRACE_MS } from "../mobile/components/LockGate";
const THROTTLE_KEY = "quiet.lockThrottle.v1";
afterEach(() => { cleanup(); vi.clearAllMocks(); state.upgrade = false; state.storage.clear(); });
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
  leaveAndReturn(LOCK_GRACE_MS + 1);
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

/** Leaves the app, then comes back after `awayMs`. */
function leaveAndReturn(awayMs: number) {
  const start = Date.now();
  const now = vi.spyOn(Date, "now").mockReturnValue(start);
  act(() => state.appState?.("inactive"));
  act(() => state.appState?.("background"));
  now.mockReturnValue(start + awayMs);
  act(() => state.appState?.("active"));
  now.mockRestore();
}

it("hides the journal at inactive, before iOS snapshots the app switcher", async () => {
  state.verify.mockResolvedValue(true);
  render(<LockGate><p>Journal</p></LockGate>);
  await act(async () => fireEvent.change(screen.getByLabelText("Passcode"), { target: { value: "1234" } }));
  expect(screen.getByText("Journal").parentElement?.style.display).toBe("flex");
  act(() => state.appState?.("inactive"));
  expect(screen.getByText("Journal").parentElement?.style.display).toBe("none");
});

it("skips the code when coming back within 10 seconds and asks for it after", async () => {
  state.verify.mockResolvedValue(true);
  render(<LockGate><p>Journal</p></LockGate>);
  await act(async () => fireEvent.change(screen.getByLabelText("Passcode"), { target: { value: "1234" } }));
  leaveAndReturn(LOCK_GRACE_MS);
  expect(screen.getByText("Journal").parentElement?.style.display).toBe("flex");
  expect(screen.queryByLabelText("Passcode")).toBeNull();
  leaveAndReturn(LOCK_GRACE_MS + 1);
  expect(screen.getByText("Journal").parentElement?.style.display).toBe("none");
  expect(screen.getByLabelText("Passcode")).toBeTruthy();
});

it("unlocks from the device shortcut after the first full check", async () => {
  state.verify.mockResolvedValue(true);
  render(<LockGate><p>Journal</p></LockGate>);
  await act(async () => fireEvent.change(screen.getByLabelText("Passcode"), { target: { value: "1234" } }));
  expect(state.verify).toHaveBeenCalledOnce();
  leaveAndReturn(LOCK_GRACE_MS + 1);
  await act(async () => fireEvent.change(screen.getByLabelText("Passcode"), { target: { value: "1234" } }));
  expect(state.verify).toHaveBeenCalledOnce();
  expect(screen.getByText("Journal").parentElement?.style.display).toBe("flex");
  leaveAndReturn(LOCK_GRACE_MS + 1);
  await act(async () => fireEvent.change(screen.getByLabelText("Passcode"), { target: { value: "9999" } }));
  expect(state.verify).toHaveBeenCalledOnce();
  expect(screen.getByText("Not quite. Try again.")).toBeTruthy();
});

it("rewrites a weaker row after unlocking and leaves a current one alone", async () => {
  state.verify.mockResolvedValue(true);
  state.upgrade = true;
  render(<LockGate><p>Journal</p></LockGate>);
  await act(async () => fireEvent.change(screen.getByLabelText("Passcode"), { target: { value: "1234" } }));
  expect(state.update).toHaveBeenCalledWith({ passcode: "hashed:1234" });
  cleanup();
  state.upgrade = false;
  state.update.mockClear();
  render(<LockGate><p>Journal</p></LockGate>);
  await act(async () => fireEvent.change(screen.getByLabelText("Passcode"), { target: { value: "1234" } }));
  expect(state.update).not.toHaveBeenCalled();
});

it("keeps the attempt throttle across a relaunch", async () => {
  state.verify.mockResolvedValue(false);
  render(<LockGate><p>Journal</p></LockGate>);
  for (let i = 0; i < 3; i++) {
    await act(async () => fireEvent.change(screen.getByLabelText("Passcode"), { target: { value: "0000" } }));
  }
  expect(screen.getByText(/Too many tries/)).toBeTruthy();
  expect(JSON.parse(state.storage.get(THROTTLE_KEY) ?? "{}").attempts).toBe(3);
  cleanup(); // force-quit, then a cold start with the same storage
  render(<LockGate><p>Journal</p></LockGate>);
  expect(await screen.findByText(/Too many tries/)).toBeTruthy();
  expect((screen.getByLabelText("Passcode") as HTMLInputElement).disabled).toBe(true);
  state.verify.mockResolvedValue(true);
  state.storage.set(THROTTLE_KEY, JSON.stringify({ attempts: 3, blockedUntil: 0 }));
  cleanup();
  render(<LockGate><p>Journal</p></LockGate>);
  await act(async () => fireEvent.change(screen.getByLabelText("Passcode"), { target: { value: "1234" } }));
  expect(state.storage.has(THROTTLE_KEY)).toBe(false);
});

it("switches accounts from the lock screen", () => {
  render(<LockGate><p>Journal</p></LockGate>);
  fireEvent.click(screen.getByRole("button", { name: "Switch account" }));
  expect(state.signOut).toHaveBeenCalledOnce();
});
