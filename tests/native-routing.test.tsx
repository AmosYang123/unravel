import { Children, isValidElement, type ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  session: null as { user: { id: string } } | null,
  settings: { onboardedAt: "done" } as { onboardedAt: string },
  settingsLoading: false,
  url: null as string | null,
  canGoBack: false,
  replace: vi.fn(),
  push: vi.fn(),
  back: vi.fn(),
  // What the root Stack was handed, and where it settled.
  stack: { initialRouteName: undefined as string | undefined, names: [] as string[], route: null as string | null },
}));
/**
 * Stands in for React Navigation's stack, reproducing the two rules that decide
 * where a closed route lands. `Stack.Protected` drops a screen whose guard is
 * false rather than redirecting away from it
 * (expo-router/build/useScreens.js: `useSortedScreens` filters `protectedScreens`),
 * and a stack left holding no route it recognises rebuilds around
 * `initialRouteName`, falling back to the first declared screen when none was
 * given (expo-router/build/react-navigation/routers/StackRouter.js:
 * `getRehydratedState` and `getStateForRouteNamesChange`).
 */
function screenNames(children: ReactNode): string[] {
  const names: string[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const props = child.props as { name?: string; guard?: boolean; children?: ReactNode };
    if (typeof props.guard === "boolean") {
      if (props.guard) names.push(...screenNames(props.children));
      return;
    }
    if (props.name) names.push(props.name);
  });
  return names;
}
vi.mock("../mobile/node_modules/expo-router", async () => {
  const Stack = ({ initialRouteName, children }: { initialRouteName?: string; children: ReactNode }) => {
    const names = screenNames(children);
    const held = mocks.stack.route;
    mocks.stack.initialRouteName = initialRouteName;
    mocks.stack.names = names;
    mocks.stack.route = held && names.includes(held)
      ? held
      : initialRouteName && names.includes(initialRouteName) ? initialRouteName : names[0] ?? null;
    return null;
  };
  Stack.Screen = () => null;
  Stack.Protected = ({ children }: { children: ReactNode }) => children;
  return {
    Stack,
    Link: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a>,
    useRouter: () => ({ replace: mocks.replace, push: mocks.push, back: mocks.back, canGoBack: () => mocks.canGoBack }),
    useRootNavigationState: () => ({ key: "root" }),
  };
});
vi.mock("../mobile/node_modules/react-native", () => ({
  View: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  Button: ({ title }: { title: string }) => <button>{title}</button>,
  ScrollView: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  StyleSheet: { create: (value: unknown) => value },
}));
vi.mock("../mobile/node_modules/expo-status-bar", () => ({ StatusBar: () => null }));
vi.mock("../mobile/node_modules/expo-splash-screen", () => ({ preventAutoHideAsync: async () => true, hideAsync: async () => true }));
vi.mock("../mobile/node_modules/expo-notifications", () => ({ DEFAULT_ACTION_IDENTIFIER: "default", clearLastNotificationResponse: vi.fn() }));
vi.mock("../mobile/node_modules/expo-linking", () => ({
  useLinkingURL: () => mocks.url,
  // Mirrors expo-linking's own parse for the shapes this app sees: a custom
  // scheme puts its first route segment in `hostname`, and an http page URL
  // leaves nothing but the host behind.
  parse: (value: string) => {
    const url = new URL(value);
    const queryParams: Record<string, string> = {};
    url.searchParams.forEach((v, k) => { queryParams[k] = v; });
    return { hostname: url.hostname || null, path: url.pathname.replace(/^\//, "") || null, queryParams, scheme: url.protocol.replace(/:$/, "") };
  },
}));
vi.mock("../mobile/node_modules/react-native-safe-area-context", () => ({
  SafeAreaProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  SafeAreaView: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/lib/auth", () => ({ AuthProvider: ({ children }: { children: ReactNode }) => <>{children}</>, useAuth: () => ({ session: mocks.session, loading: false, signOut: vi.fn() }) }));
vi.mock("@/lib/store", () => ({ loadUserData: vi.fn(), useSettings: () => ({ settings: mocks.settings, loading: mocks.settingsLoading, error: null }) }));
vi.mock("../mobile/lib/notifications", () => ({ REMINDER_KIND: "reminder", REMINDER_ROUTE: "/write?mode=short", reminderResponseKey: () => "", useLastReminderResponse: () => null, useReminderSync: vi.fn() }));
vi.mock("@/theme/ThemeProvider", () => ({ ThemeProvider: ({ children }: { children: ReactNode }) => <>{children}</>, useTheme: () => ({ theme: { dark: false, colors: {} } }), useStyles: () => ({}) }));
vi.mock("@/theme/useAppFonts", () => ({ useAppFonts: () => true }));
vi.mock("../mobile/components/ui", () => ({
  ToastProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  Button: ({ label, onPress }: { label: string; onPress: () => void }) => <button onClick={onPress}>{label}</button>,
  PageTitle: ({ children }: { children: ReactNode }) => <h1>{children}</h1>,
}));
vi.mock("@/components/LockGate", () => ({ default: ({ children }: { children: ReactNode }) => <>{children}</> }));
import RootLayout from "../mobile/app/_layout";
import Privacy from "../mobile/app/privacy";
import { setPasswordRecoveryPending } from "../mobile/lib/passwordRecovery";
const SESSION = { user: { id: "one" } };
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.session = null;
  mocks.settings = { onboardedAt: "done" };
  mocks.settingsLoading = false;
  mocks.url = null;
  mocks.canGoBack = false;
  mocks.stack = { initialRouteName: undefined, names: [], route: null };
  setPasswordRecoveryPending(false);
});

it("lands a signed-out cold start on the auth screen, not the privacy policy", () => {
  render(<RootLayout />);
  expect(mocks.stack.initialRouteName).toBe("auth");
  expect(mocks.stack.route).toBe("auth");
});

it("opens the app for a signed-in guest, not the privacy policy", () => {
  const view = render(<RootLayout />);
  expect(mocks.stack.route).toBe("auth");
  mocks.session = SESSION;
  view.rerender(<RootLayout />);
  expect(mocks.stack.initialRouteName).toBe("(tabs)");
  expect(mocks.stack.route).toBe("(tabs)");
});

it("asks a brand new account to onboard before the app", () => {
  mocks.session = SESSION;
  mocks.settings = { onboardedAt: "" };
  render(<RootLayout />);
  expect(mocks.stack.initialRouteName).toBe("onboarding");
  expect(mocks.stack.route).toBe("onboarding");
});

it("keeps the auth screen up, and the app shut, while a reset is pending", () => {
  mocks.session = SESSION;
  setPasswordRecoveryPending(true);
  render(<RootLayout />);
  expect(mocks.stack.initialRouteName).toBe("auth");
  expect(mocks.stack.route).toBe("auth");
  expect(mocks.stack.names).not.toContain("(tabs)");
});

it("keeps the privacy policy mounted signed out, mid-onboarding and signed in", () => {
  for (const state of ["out", "onboarding", "in"] as const) {
    mocks.stack = { initialRouteName: undefined, names: [], route: null };
    mocks.session = state === "out" ? null : SESSION;
    mocks.settings = { onboardedAt: state === "onboarding" ? "" : "done" };
    render(<RootLayout />);
    expect(mocks.stack.names).toContain("privacy");
    expect(mocks.stack.route).not.toBe("privacy");
    cleanup();
  }
});

it("records no destination for Expo Web's own page URL", () => {
  mocks.url = "http://localhost:8081/";
  const view = render(<RootLayout />);
  mocks.session = SESSION;
  view.rerender(<RootLayout />);
  expect(mocks.replace).not.toHaveBeenCalled();
});

it("records no destination for a link naming no route in this app", () => {
  mocks.url = "unravel://nowhere";
  const view = render(<RootLayout />);
  mocks.session = SESSION;
  view.rerender(<RootLayout />);
  expect(mocks.replace).not.toHaveBeenCalled();
});

it("records no destination for a real route arriving on somebody else's scheme", () => {
  mocks.url = "otherapp://write?mode=short";
  const view = render(<RootLayout />);
  mocks.session = SESSION;
  view.rerender(<RootLayout />);
  expect(mocks.replace).not.toHaveBeenCalled();
});

it("replays a reminder link tapped while signed out once sign-in clears", () => {
  mocks.url = "unravel://write?mode=short";
  const view = render(<RootLayout />);
  expect(mocks.replace).not.toHaveBeenCalled();
  mocks.session = SESSION;
  view.rerender(<RootLayout />);
  expect(mocks.replace).toHaveBeenCalledWith("/write?mode=short");
});

it("does not replay a recovery link after sign-in", () => {
  mocks.url = "unravel://auth?mode=recovery#access_token=at-1&refresh_token=rt-1&type=recovery";
  const view = render(<RootLayout />);
  mocks.session = SESSION;
  view.rerender(<RootLayout />);
  expect(mocks.replace).not.toHaveBeenCalled();
});

// Both back controls, top and bottom, run the same handler.
function backControls() {
  return screen.getAllByRole("button", { name: "Back" });
}

it("steps the privacy policy back up the stack when there is one", () => {
  mocks.canGoBack = true;
  mocks.session = SESSION;
  render(<Privacy />);
  const controls = backControls();
  expect(controls).toHaveLength(2);
  for (const control of controls) fireEvent.click(control);
  expect(mocks.back).toHaveBeenCalledTimes(2);
  expect(mocks.replace).not.toHaveBeenCalled();
});

it("sends the privacy policy back to the auth screen when nobody is signed in", () => {
  render(<Privacy />);
  for (const control of backControls()) fireEvent.click(control);
  expect(mocks.replace).toHaveBeenNthCalledWith(1, "/auth");
  expect(mocks.replace).toHaveBeenNthCalledWith(2, "/auth");
  expect(mocks.back).not.toHaveBeenCalled();
});

it("sends the privacy policy back to the app when somebody is, rather than to itself", () => {
  mocks.session = SESSION;
  render(<Privacy />);
  for (const control of backControls()) fireEvent.click(control);
  expect(mocks.replace).toHaveBeenNthCalledWith(1, "/");
  expect(mocks.replace).toHaveBeenNthCalledWith(2, "/");
});

it("sends the privacy policy back to the auth screen mid-recovery, session or not", () => {
  mocks.session = SESSION;
  setPasswordRecoveryPending(true);
  render(<Privacy />);
  fireEvent.click(backControls()[0]!);
  expect(mocks.replace).toHaveBeenCalledWith("/auth");
});
