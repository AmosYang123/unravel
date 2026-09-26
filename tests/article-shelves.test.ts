import { readFileSync } from "node:fs";
import ts from "typescript";
import { z } from "zod";
import { afterEach, expect, it, vi } from "vitest";
import { hasSharingConsent } from "../supabase/functions/_shared/sharing-consent";
import { libraryShelf } from "../supabase/functions/article-recs/library";
import { buildShelves, shelfSignalText } from "../supabase/functions/article-recs/shelves";

afterEach(() => vi.restoreAllMocks());

const reader = { yearLevel: "upper", focus: ["school"], goals: [], interests: ["student council", "drawing"] };

it("leads with the reader's interests and searches for the interest itself", () => {
  const shelves = buildShelves(reader, null, "");
  expect(shelves.slice(0, 2).map((s) => s.label.toLowerCase()).sort()).toEqual(["drawing", "student council"]);
  const council = shelves.find((s) => s.label.toLowerCase() === "student council")!;
  expect(council.query).toMatch(/^student council tips and advice/);
});

it("never fills an interest shelf with articles that are not about it", () => {
  const shelves = buildShelves(reader, null, "");
  const sections = libraryShelf(
    shelfSignalText(reader, null, ""),
    shelves.map((s) => ({ label: s.label, library: s.library, note: s.note, why: s.why, match: s.match })),
  );
  expect(sections.some((s) => s.category.toLowerCase() === "student council")).toBe(false);
});

it("searches with Tavily when its key is set, one query per shelf", async () => {
  const insert = vi.fn((rows: unknown[]) => ({ select: async () => ({ data: rows, error: null }) }));
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "caller" } } }) },
    rpc: async () => ({ data: true, error: null }),
    from: (table: string) => table === "profiles"
      ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { ai_suggestions_enabled: true, ai_consent_version: "2026-09-11" }, error: null }) }) }) }
      : { select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) }) }), insert },
  };
  const request = vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
    const { query } = JSON.parse(String(init?.body)) as { query: string };
    const slug = query.split(" ")[0];
    return new Response(JSON.stringify({ results: [1, 2].map((n) => ({
      title: `${query} ${n}`, url: `https://example.org/${slug}-${n}`, content: "About it.",
    })) }), { status: 200 });
  });
  let handler: ((r: Request) => Promise<Response>) | undefined;
  const deno = {
    env: { get: (key: string) => (key === "TAVILY_API_KEY" ? "tvly-test" : key.startsWith("GOOGLE") ? undefined : "configured") },
    serve: (cb: (r: Request) => Promise<Response>) => { handler = cb; },
  };
  const source = readFileSync("supabase/functions/article-recs/index.ts", "utf8").replace(/^import .*;\n/gm, "");
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  new Function("createClient", "Deno", "z", "hasSharingConsent", "libraryShelf", "buildShelves", "shelfSignalText", compiled)(
    () => client, deno, z, hasSharingConsent, libraryShelf, buildShelves, shelfSignalText,
  );

  const res = await handler!(new Request("https://test/article-recs", {
    method: "POST", headers: { Authorization: "Bearer t" }, body: JSON.stringify({ suggestions: true, reader, refresh: true }),
  }));
  const body = (await res.json()) as { items: { category: string; title: string }[]; curated: boolean };

  expect(request.mock.calls.every(([url]) => url === "https://api.tavily.com/search")).toBe(true);
  expect(body.curated).toBe(false);
  expect(body.items[0].category.toLowerCase()).toMatch(/student council|drawing/);
  const council = body.items.filter((i) => i.category.toLowerCase() === "student council");
  expect(council.length).toBeGreaterThan(0);
  expect(council.every((i) => i.title.startsWith("student council"))).toBe(true);
});
