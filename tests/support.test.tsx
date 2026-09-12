import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import Support from "../src/pages/Support";
import { releaseConfig } from "../src/lib/release-config";

vi.mock("@/lib/release-config", () => ({ releaseConfig: { ownerName: "", supportEmail: "", privacyUrl: "", supportUrl: "" } }));

afterEach(() => { cleanup(); releaseConfig.supportEmail = ""; releaseConfig.ownerName = ""; });

it("shows public support and deletion instructions without an account", () => {
  render(<MemoryRouter><Support /></MemoryRouter>);
  expect(screen.getByRole("heading", { name: "Unravel support" })).toBeTruthy();
  expect(screen.getByText(/permanently delete your account/)).toBeTruthy();
  expect(screen.getByText("Support contact details are not yet available.")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Privacy policy" }).getAttribute("href")).toBe("/privacy");
});

it("uses the configured owner and support inbox", () => {
  releaseConfig.supportEmail = "help@example.com";
  releaseConfig.ownerName = "Test Owner";
  render(<MemoryRouter><Support /></MemoryRouter>);
  expect(screen.getByText("App owner: Test Owner")).toBeTruthy();
  expect(screen.getByRole("link", { name: "help@example.com" }).getAttribute("href")).toBe("mailto:help@example.com");
});
