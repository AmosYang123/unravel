import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { SiteRoutes } from "../src/Site";

// Fail if any public page tries to initialize the private account application.
vi.mock("../src/App", () => { throw new Error("Public pages must not load the journal application"); });
afterEach(cleanup);

it("shows the public home and confirmed operators without loading the journal", () => {
  render(<MemoryRouter initialEntries={["/"]}><SiteRoutes /></MemoryRouter>);
  expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("hold it all.");
  expect(screen.getByText("Operated by Amos Yang and Faye Yang.")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Open web journal" }).getAttribute("href")).toBe("/journal");
  expect(screen.queryByText(/Download on the App Store/)).toBeNull();
});

it.each([["/privacy", "Privacy policy"], ["/support", "Unravel support"]])("opens %s directly without loading account code", (path, heading) => {
  render(<MemoryRouter initialEntries={[path!]}><SiteRoutes /></MemoryRouter>);
  expect(screen.getByRole("heading", { name: heading, level: 1 })).toBeTruthy();
  expect(screen.getByText("App owner: Amos Yang and Faye Yang")).toBeTruthy();
  expect(screen.getByRole("link", { name: "unravelreminders+support@gmail.com" }).getAttribute("href")).toBe("mailto:unravelreminders+support@gmail.com");
  expect(screen.queryByRole("link", { name: "unravelsupport@gmail.com" })).toBeNull();
});
