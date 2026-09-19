import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import AccountSection from "../src/components/settings/AccountSection";

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
  invoke: vi.fn(),
  from: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { id: "one", email: "person@example.com", is_anonymous: false }, signOut: mocks.signOut }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: mocks.invoke }, from: mocks.from },
}));
vi.mock("@/lib/store", () => ({
  importLegacyLocalData: vi.fn(),
  legacyLocalEntryCount: () => 0,
}));

beforeEach(() => {
  mocks.signOut.mockReset();
  mocks.invoke.mockReset();
  mocks.from.mockReset().mockReturnValue({
    select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
  });
});
afterEach(cleanup);

const openAccountDialog = () => {
  render(<AccountSection />);
  fireEvent.click(screen.getByText("Account"));
};

it("does not invoke deletion until the confirmation is accepted", () => {
  openAccountDialog();
  fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
  expect(screen.getByText("Delete your account?")).toBeTruthy();
  expect(mocks.invoke).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Keep my account" }));
  expect(mocks.invoke).not.toHaveBeenCalled();
});

it("signs the user out once deletion succeeds", async () => {
  mocks.invoke.mockResolvedValue({ data: { deleted: true }, error: null });
  openAccountDialog();
  fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
  fireEvent.click(screen.getByRole("button", { name: "Delete forever" }));
  await waitFor(() => expect(mocks.signOut).toHaveBeenCalled());
  expect(mocks.invoke).toHaveBeenCalledWith("delete-account");
});

it("reports a failed deletion as a failure, and does not sign out or claim success", async () => {
  mocks.invoke.mockResolvedValue({ data: null, error: new Error("edge function unavailable") });
  openAccountDialog();
  fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
  fireEvent.click(screen.getByRole("button", { name: "Delete forever" }));
  await waitFor(() => expect(screen.getByText("edge function unavailable")).toBeTruthy());
  expect(mocks.signOut).not.toHaveBeenCalled();
  expect(screen.queryByText("Deleting…")).toBeNull();
});
