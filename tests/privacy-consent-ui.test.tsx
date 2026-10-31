import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import PrivacySection from "../src/components/settings/PrivacySection";
import Privacy from "../src/pages/Privacy";

vi.mock("sonner", () => ({ toast: vi.fn() }));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/lib/store", () => ({
  useSettings: () => ({ settings: { lockEnabled: false }, update: vi.fn() }),
  useEntries: () => ({ deletedEntries: [], loading: false }),
  fetchAllEntries: vi.fn(), hashPasscode: vi.fn(),
}));
afterEach(cleanup);

it("shows that suggestions do not share journal content externally", () => {
  render(<MemoryRouter><PrivacySection /></MemoryRouter>);
  expect(screen.getByText("On-device suggestions")).toBeTruthy();
  expect(screen.getByText(/not sent to an AI, search, music lookup, or transcription service/i)).toBeTruthy();
  expect(screen.queryByRole("switch", { name: /AI suggestions/i })).toBeNull();
});

it("public policy identifies processors and says third-party AI sharing is absent", () => {
  render(<MemoryRouter><Privacy /></MemoryRouter>);
  expect(screen.getByRole("heading", { name: "Privacy policy" })).toBeTruthy();
  expect(screen.getByText(/Supabase provides authentication/i)).toBeTruthy();
  expect(screen.getByText(/does not send journal entries.*third-party AI service/i)).toBeTruthy();
});

it("microphone prompt says recordings are not sent for AI or transcription", async () => {
  const appJson = (await import("../mobile/app.json")).default;
  const audio = appJson.expo.plugins.find((p) => Array.isArray(p) && p[0] === "expo-audio") as [string, { microphonePermission: string }];
  expect(audio[1].microphonePermission).toMatch(/not sent to an AI or transcription service/i);
});
