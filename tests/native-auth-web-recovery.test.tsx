import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ getSession: vi.fn(), updateUser: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: {
  ...auth, onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
} } }));
vi.mock("@/pages/Auth", () => ({ PASSWORD_RULE_LABEL: "At least 8 characters" }));
import ResetPassword from "../src/pages/ResetPassword";
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it("shows an invalid link when session restoration rejects", async () => {
  auth.getSession.mockRejectedValue(new Error("offline"));
  render(<MemoryRouter><ResetPassword /></MemoryRouter>);
  expect(await screen.findByText(/This link has expired/)).toBeTruthy();
  expect(screen.queryByText("Checking your link.")).toBeNull();
});
it("allows retry after a rejected password update", async () => {
  auth.getSession.mockResolvedValue({ data: { session: { user: { id: "one" } } } });
  auth.updateUser.mockRejectedValue(new Error("offline"));
  render(<MemoryRouter><ResetPassword /></MemoryRouter>);
  await screen.findByLabelText("New password");
  fireEvent.change(screen.getByLabelText("New password"), { target: { value: "password123" } });
  fireEvent.change(screen.getByLabelText("Repeat password"), { target: { value: "password123" } });
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save new password" })));
  expect(screen.getByText(/We couldn't connect/)).toBeTruthy();
  expect((screen.getByRole("button", { name: "Save new password" }) as HTMLButtonElement).disabled).toBe(false);
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save new password" })));
  expect(auth.updateUser).toHaveBeenCalledTimes(2);
});
