import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ signUp: vi.fn(), signInWithPassword: vi.fn(), signInAnonymously: vi.fn(), resend: vi.fn(), resetPasswordForEmail: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth } }));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ session: null, loading: false }) }));
vi.mock("@/lib/authCapabilities", () => ({ useAnonymousSignIn: () => true }));
import AuthPage from "../src/pages/Auth";

afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); });

function renderAuth() {
  render(<MemoryRouter><AuthPage /></MemoryRouter>);
}
function checkbox() {
  return screen.getByRole("checkbox", { name: /I've read/ });
}
function birthDateField() {
  return screen.getByLabelText("Your date of birth");
}
// Fixed month/day so subtracting years can never land on a leap day.
function bornYearsAgo(years: number) {
  return `${new Date().getFullYear() - years}-01-15`;
}
function giveAdultBirthDate() {
  fireEvent.change(birthDateField(), { target: { value: bornYearsAgo(20) } });
}
function goToSignIn() {
  fireEvent.click(screen.getByText("I already have an account"));
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "person@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
}

it("keeps create account locked until the privacy box is ticked, then enables it", () => {
  renderAuth();
  // Default mode is signup: the box starts unticked and blocks account creation.
  expect((checkbox() as HTMLInputElement).checked).toBe(false);
  expect((screen.getByText("Create account").closest("button") as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "person@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
  fireEvent.change(screen.getByLabelText("Repeat password"), { target: { value: "password123" } });
  expect((screen.getByText("Create account").closest("button") as HTMLButtonElement).disabled).toBe(true);
  giveAdultBirthDate();
  fireEvent.click(checkbox());
  expect((checkbox() as HTMLInputElement).checked).toBe(true);
  expect((screen.getByText("Create account").closest("button") as HTMLButtonElement).disabled).toBe(false);
});

it("never gates sign-in on the privacy box, ticked or not", () => {
  renderAuth();
  goToSignIn();
  expect((checkbox() as HTMLInputElement).checked).toBe(false);
  expect((screen.getByText("Sign in").closest("button") as HTMLButtonElement).disabled).toBe(false);
});

it("keeps continue-as-guest locked until the privacy box is ticked, then enables it", () => {
  renderAuth();
  goToSignIn();
  expect((checkbox() as HTMLInputElement).checked).toBe(false);
  expect((screen.getByText("Continue as guest").closest("button") as HTMLButtonElement).disabled).toBe(true);
  giveAdultBirthDate();
  fireEvent.click(checkbox());
  expect((screen.getByText("Continue as guest").closest("button") as HTMLButtonElement).disabled).toBe(false);
});

it("links to the privacy policy without toggling the checkbox", () => {
  renderAuth();
  const link = screen.getByRole("link", { name: "privacy policy" });
  expect(link.getAttribute("href")).toBe("/privacy");
  expect((checkbox() as HTMLInputElement).checked).toBe(false);
  fireEvent.click(link);
  expect((checkbox() as HTMLInputElement).checked).toBe(false);
});

it("toggles the checkbox from the label words on either side of the link", () => {
  renderAuth();
  fireEvent.click(screen.getByText("I've read the"));
  expect((checkbox() as HTMLInputElement).checked).toBe(true);
  fireEvent.click(screen.getByText("."));
  expect((checkbox() as HTMLInputElement).checked).toBe(false);
});

it("refuses to create an account for an under-13 date of birth, however the box is ticked", () => {
  renderAuth();
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "person@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
  fireEvent.change(screen.getByLabelText("Repeat password"), { target: { value: "password123" } });
  fireEvent.click(checkbox());
  fireEvent.change(birthDateField(), { target: { value: bornYearsAgo(8) } });

  expect(screen.getByText(/aged 13 and over/)).toBeTruthy();
  expect((screen.getByText("Create account").closest("button") as HTMLButtonElement).disabled).toBe(true);
  expect(auth.signUp).not.toHaveBeenCalled();
});

it("refuses a guest journal for an under-13 date of birth", () => {
  renderAuth();
  goToSignIn();
  fireEvent.click(checkbox());
  fireEvent.change(birthDateField(), { target: { value: bornYearsAgo(8) } });

  expect((screen.getByText("Continue as guest").closest("button") as HTMLButtonElement).disabled).toBe(true);
  expect(auth.signInAnonymously).not.toHaveBeenCalled();
});

it("reopens the account once the date of birth is corrected upward", () => {
  renderAuth();
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "person@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
  fireEvent.change(screen.getByLabelText("Repeat password"), { target: { value: "password123" } });
  fireEvent.click(checkbox());
  fireEvent.change(birthDateField(), { target: { value: bornYearsAgo(8) } });
  expect((screen.getByText("Create account").closest("button") as HTMLButtonElement).disabled).toBe(true);

  fireEvent.change(birthDateField(), { target: { value: bornYearsAgo(20) } });
  expect(screen.queryByText(/aged 13 and over/)).toBeNull();
  expect((screen.getByText("Create account").closest("button") as HTMLButtonElement).disabled).toBe(false);
});

it("never asks a returning account for its date of birth", () => {
  renderAuth();
  goToSignIn();
  // Sign-in cleared this gate when the account was made; asking again would
  // collect a birth date from someone who has no way to refuse it.
  expect((screen.getByText("Sign in").closest("button") as HTMLButtonElement).disabled).toBe(false);
});
