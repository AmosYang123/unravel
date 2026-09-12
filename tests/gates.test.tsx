import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { RequireAuth } from "../src/App";

const mocks = vi.hoisted(() => ({
  auth: { session: { user: { id: "one" } }, loading: false, signOut: vi.fn() },
  profile: { settings: { lockEnabled: false, passcode: "", onboardedAt: "done" }, loading: false, error: null as string | null, update: vi.fn() },
  verify: vi.fn(), load: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ useAuth: () => mocks.auth, AuthProvider: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("@/lib/store", () => ({
  useSettings: () => mocks.profile, applyAppearance: vi.fn(), loadUserData: mocks.load,
  verifyPasscode: mocks.verify, hashPasscode: vi.fn(), isLegacyPasscode: () => false,
}));
function TestApp() {
  return <MemoryRouter><Routes><Route element={<RequireAuth />}>
    <Route path="/" element={<><p>Private journal</p><Link to="/history">History</Link></>} />
    <Route path="/history" element={<p>Private history</p>} />
    <Route path="/onboarding" element={<p>A few things</p>} />
  </Route></Routes></MemoryRouter>;
}
afterEach(cleanup);
beforeEach(() => {
  mocks.auth.session = { user: { id: "one" } };
  mocks.profile.settings = { lockEnabled: false, passcode: "", onboardedAt: "done" };
  mocks.profile.loading = false;
  mocks.profile.error = null;
  mocks.verify.mockReset();
});
describe("entry gates", () => {
  it("does not expose the journal before onboarding is known", async () => {
    mocks.profile.loading = true;
    mocks.profile.settings.onboardedAt = "";
    const view = render(<TestApp />);
    expect(screen.queryByText("Private journal")).toBeNull();
    expect(screen.queryByText("A few things")).toBeNull();
    mocks.profile.loading = false;
    view.rerender(<TestApp />);
    expect(await screen.findByText("A few things")).toBeTruthy();
    expect(screen.queryByText("Private journal")).toBeNull();
  });
  it("fails closed and offers retry after a profile error", () => {
    mocks.profile.error = "offline";
    render(<TestApp />);
    expect(screen.queryByText("Private journal")).toBeNull();
    fireEvent.click(screen.getByText("Try again"));
    expect(mocks.load).toHaveBeenCalledWith("one");
  });
  it("unlocks once across navigation and locks for a different account", async () => {
    mocks.profile.settings.lockEnabled = true;
    mocks.profile.settings.passcode = "hash";
    mocks.verify.mockResolvedValue(true);
    const view = render(<TestApp />);
    expect(screen.queryByText("Private journal")).toBeNull();
    fireEvent.change(screen.getByLabelText("Passcode"), { target: { value: "1234" } });
    await screen.findByText("Private journal");
    fireEvent.click(screen.getByText("History"));
    expect(await screen.findByText("Private history")).toBeTruthy();
    mocks.auth.session = { user: { id: "two" } };
    view.rerender(<TestApp />);
    expect(screen.getByLabelText("Passcode")).toBeTruthy();
    expect(screen.queryByText("Private history")).toBeNull();
  });
  it("recovers from a verification error instead of sticking at four digits", async () => {
    mocks.profile.settings.lockEnabled = true;
    mocks.profile.settings.passcode = "hash";
    mocks.verify.mockRejectedValueOnce(new Error("crypto unavailable")).mockResolvedValueOnce(true);
    render(<TestApp />);
    fireEvent.change(screen.getByLabelText("Passcode"), { target: { value: "1234" } });
    await screen.findByRole("alert");
    const field = screen.getByLabelText("Passcode") as HTMLInputElement;
    expect(field.value).toBe("");
    expect(field.disabled).toBe(false);
    fireEvent.change(field, { target: { value: "1234" } });
    await screen.findByText("Private journal");
  });
  it("throttles repeated incorrect attempts", async () => {
    mocks.profile.settings.lockEnabled = true;
    mocks.profile.settings.passcode = "hash";
    mocks.verify.mockResolvedValue(false);
    render(<TestApp />);
    for (let i = 0; i < 3; i++) {
      await act(async () => fireEvent.change(screen.getByLabelText("Passcode"), { target: { value: "0000" } }));
      await waitFor(() => expect((screen.getByLabelText("Passcode") as HTMLInputElement).value).toBe(""));
    }
    expect(screen.getByRole("status").textContent).toContain("Wait 5s");
    expect((screen.getByLabelText("Passcode") as HTMLInputElement).disabled).toBe(true);
  });
});
