import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import PrivacySection from "../src/components/settings/PrivacySection";
import Privacy from "../src/pages/Privacy";

const mocks = vi.hoisted(() => ({ update: vi.fn(), toast: vi.fn() }));
vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/lib/store", () => ({
  useSettings: () => ({ settings: { aiSuggestionsEnabled: false }, update: mocks.update }),
  useEntries: () => ({ deletedEntries: [], loading: false }),
  fetchAllEntries: vi.fn(), hashPasscode: vi.fn(),
}));
beforeEach(() => { mocks.update.mockReset().mockResolvedValue(undefined); });
afterEach(cleanup);

it("does not enable sharing until the person reads the notice and confirms", async () => {
  render(<MemoryRouter><PrivacySection /></MemoryRouter>);
  fireEvent.click(screen.getAllByRole("switch")[1]!);
  expect(mocks.update).not.toHaveBeenCalled();
  expect(screen.getByText(/journal text.*voice recordings.*to Groq/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Not now" }));
  expect(mocks.update).not.toHaveBeenCalled();
  fireEvent.click(screen.getAllByRole("switch")[1]!);
  fireEvent.click(screen.getByRole("button", { name: "Allow sharing" }));
  await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ aiSuggestionsEnabled: true }));
});

it("reports a failed consent save without pretending it succeeded", async () => {
  mocks.update.mockRejectedValue(new Error("offline"));
  render(<MemoryRouter><PrivacySection /></MemoryRouter>);
  fireEvent.click(screen.getAllByRole("switch")[1]!);
  fireEvent.click(screen.getByRole("button", { name: "Allow sharing" }));
  await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith("Couldn't save your sharing choice. Please try again."));
});

it("renders the public policy without account information", () => {
  render(<MemoryRouter><Privacy /></MemoryRouter>);
  expect(screen.getByRole("heading", { name: "Privacy policy" })).toBeTruthy();
  expect(screen.getByText(/administrator dashboard/)).toBeTruthy();
  expect(screen.getByText(/Google's Gmail API/)).toBeTruthy();
});

it("names Groq as the AI processor without showing the removed Gemini processor", () => {
  render(<MemoryRouter><Privacy /></MemoryRouter>);
  expect(screen.getByText(/send journal text.*to Groq/i)).toBeTruthy();
  expect(screen.queryByText(/Google Gemini/i)).toBeNull();
});
