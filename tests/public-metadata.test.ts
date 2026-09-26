import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SITE_ORIGIN = "https://officialunravel.vercel.app";

// Routes behind RequireAuth in src/App.tsx, plus the pages you reach mid sign-in.
// A new private route belongs here and in public/robots.txt.
const PRIVATE_ROUTES = [
  "/auth",
  "/reset-password",
  "/onboarding",
  "/journal",
  "/write",
  "/history",
  "/entry/",
  "/insights",
  "/reading",
  "/impact",
  "/settings",
  "/breathe",
];

const indexHtml = readFileSync("index.html", "utf8");
const robots = readFileSync("public/robots.txt", "utf8");
const sitemap = readFileSync("public/sitemap.xml", "utf8");

describe("social preview metadata", () => {
  // Scrapers resolve og:image against nothing, so a relative path yields no preview.
  it.each(["og:image", "twitter:image"])("points %s at an absolute url", (tag) => {
    const attr = tag.startsWith("og:") ? "property" : "name";
    const match = indexHtml.match(new RegExp(`<meta ${attr}="${tag}" content="([^"]+)"`));
    expect(match?.[1]).toBe(`${SITE_ORIGIN}/og-image.png`);
  });

  it("ships the preview image at the dimensions the tags declare", () => {
    const png = readFileSync("public/og-image.png");
    expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
    expect(indexHtml).toContain('<meta property="og:image:width" content="1200" />');
    expect(indexHtml).toContain('<meta property="og:image:height" content="630" />');
  });

  it("keeps a title, description and canonical url", () => {
    expect(indexHtml).toMatch(/<title>.+<\/title>/);
    expect(indexHtml).toMatch(/<meta\s+name="description"/);
    expect(indexHtml).toContain(`<link rel="canonical" href="${SITE_ORIGIN}/" />`);
  });
});

describe("crawler directives", () => {
  it("keeps every private route out of search", () => {
    for (const route of PRIVATE_ROUTES) {
      expect(robots).toContain(`Disallow: ${route}`);
      expect(sitemap).not.toContain(`${SITE_ORIGIN}${route}`);
    }
  });

  it("lists only the public pages in the sitemap", () => {
    const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toEqual([
      `${SITE_ORIGIN}/`,
      `${SITE_ORIGIN}/privacy`,
      `${SITE_ORIGIN}/terms`,
      `${SITE_ORIGIN}/support`,
    ]);
  });

  it("advertises the sitemap and still lets social scrapers fetch previews", () => {
    expect(robots).toContain(`Sitemap: ${SITE_ORIGIN}/sitemap.xml`);
    expect(robots).toMatch(/User-agent: Twitterbot\nAllow: \//);
    expect(robots).toMatch(/User-agent: facebookexternalhit\nAllow: \//);
  });
});

describe("transport security", () => {
  const vercel = JSON.parse(readFileSync("vercel.json", "utf8"));
  const headers: Array<{ key: string; value: string }> = vercel.headers[0].headers;
  const valueOf = (key: string) => headers.find((h) => h.key === key)?.value;

  it("forces https for at least a year", () => {
    const hsts = valueOf("Strict-Transport-Security");
    expect(hsts).toBeDefined();
    const maxAge = Number(hsts!.match(/max-age=(\d+)/)?.[1]);
    expect(maxAge).toBeGreaterThanOrEqual(31536000);
  });

  it.each([
    ["X-Content-Type-Options", "nosniff"],
    ["X-Frame-Options", "DENY"],
    ["Referrer-Policy", "strict-origin-when-cross-origin"],
  ])("sets %s", (key, value) => {
    expect(valueOf(key)).toBe(value);
  });

  // Entry ids live in the path, so cross-origin requests must not carry it.
  it("never sends a full journal url to another origin", () => {
    expect(valueOf("Referrer-Policy")).not.toMatch(/unsafe-url|^origin-when-cross-origin$/);
  });

  // The journal records voice memos; blocking the mic would break that.
  it("keeps the microphone available while denying unused hardware", () => {
    const permissions = valueOf("Permissions-Policy")!;
    expect(permissions).not.toContain("microphone");
    expect(permissions).toContain("camera=()");
    expect(permissions).toContain("geolocation=()");
  });
});
