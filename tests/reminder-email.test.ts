import { describe, expect, it, vi } from "vitest";
import { reminderBody, reminderLink } from "../supabase/functions/_shared/reminder-email";
import { gmailRawMessage } from "../supabase/functions/_shared/gmail";
describe("reminder emails", () => {
  it("supports the native check-in link without a website", () => {
    const email = reminderBody("Sam", false, null, "unravel://write?mode=short");
    expect(email.html).toContain('href="unravel://write?mode=short"');
    expect(email.text).toContain("unravel://write?mode=short");
  });
  it("escapes profile text in HTML while preserving readable plain text", () => {
    const email = reminderBody('<img src=x> & "Sam"', false, null);
    expect(email.html).not.toContain("<img");
    expect(email.html).toContain("&lt;img src=x&gt; &amp; &quot;Sam&quot;");
    expect(email.text).toContain('<img src=x> & "Sam"');
  });
  it("rejects unsafe links and supports a trailing slash on web", () => {
    expect(reminderLink(null, "javascript:alert(1)")).toBeNull();
    expect(reminderLink(null, "unravel://settings")).toBeNull();
    expect(reminderLink("https://example.com/")).toBe("https://example.com/write?mode=short");
    expect(reminderLink("broken")).toBeNull();
  });
  it("tells every reminder how to stop the reminders", () => {
    const plain = reminderBody("Sam", false, "https://example.com");
    expect(plain.text).toContain("turn reminders off in Unravel's settings");
    expect(plain.html).toContain("turn reminders off in Unravel&#39;s settings");
    const discreet = reminderBody("Sam", true, "https://example.com");
    expect(discreet.text).toContain("turn reminders off in the app's settings");
  });
  it("prints a postal address when one is configured", () => {
    const email = reminderBody("Sam", false, "https://example.com", null, "Unravel, 1 Example St, Exeter EX1 1AA");
    expect(email.text).toContain("Unravel, 1 Example St, Exeter EX1 1AA");
    expect(email.html).toContain("Unravel, 1 Example St, Exeter EX1 1AA");
  });
  it("omits the footer address entirely when none is configured", () => {
    const email = reminderBody("Sam", false, "https://example.com");
    expect(email.html).not.toContain("<br>");
  });
  it("never lets the discreet footer name the app or carry an address", () => {
    // Discreet exists so a watched inbox learns nothing. A compliance footer
    // must not be the thing that gives it away.
    const email = reminderBody("Sam", true, "https://example.com", null, "Unravel, 1 Example St, Exeter EX1 1AA");
    expect(email.text.toLowerCase()).not.toContain("unravel");
    expect(email.text).not.toContain("Example St");
    expect(email.html).not.toContain("Example St");
  });
  it("escapes a postal address rather than trusting the configured value", () => {
    const email = reminderBody("Sam", false, "https://example.com", null, "<script>alert(1)</script>");
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
  });
  it("keeps the footer inside the styled wrapper", () => {
    const email = reminderBody("Sam", false, "https://example.com");
    expect(email.html.trimEnd().endsWith("</div>")).toBe(true);
  });
  it("keeps discreet plain text free of app names and links", () => {
    const email = reminderBody("Sam", true, null, "unravel://write?mode=short");
    expect(email.text.toLowerCase()).not.toContain("unravel");
    expect(email.html).toContain("unravel://write?mode=short");
  });
});

it("builds a safe multipart Gmail message", () => {
  vi.stubGlobal("Deno", { env: { get: () => "Unravel <unravelreminders@gmail.com>" } });
  const raw = gmailRawMessage({
    to: "reader@example.com\r\nBcc: stolen@example.com",
    subject: "A moment for you\r\nBcc: stolen@example.com",
    text: "Plain reminder",
    html: "<p>HTML reminder</p>",
  }, "test-boundary");
  const padded = raw.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(raw.length / 4) * 4, "=");
  const decoded = decodeURIComponent(escape(atob(padded)));
  expect(decoded).toContain("From: Unravel <unravelreminders@gmail.com>");
  expect(decoded).toContain("To: reader@example.comBcc: stolen@example.com");
  expect(decoded).not.toContain("\r\nBcc: stolen@example.com");
  expect(decoded).toContain("Content-Type: multipart/alternative");
  expect(decoded).toContain("Plain reminder");
  expect(decoded).toContain("<p>HTML reminder</p>");
});
