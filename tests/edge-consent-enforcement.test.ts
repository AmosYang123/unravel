import { readFileSync } from "node:fs";
import ts from "typescript";
import { z } from "zod";
import { afterEach, expect, it, vi } from "vitest";
import { hasSharingConsent } from "../supabase/functions/_shared/sharing-consent";
import { libraryShelf } from "../supabase/functions/article-recs/library";
import { buildShelves, shelfSignalText } from "../supabase/functions/article-recs/shelves";

afterEach(() => vi.restoreAllMocks());

it.each(["entry-advice", "transcribe-voice", "normalize-tag", "spotify-songs"])("%s refuses external processing without current consent", async (name) => {
  const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("External calls must not occur"));
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "caller" } } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { ai_suggestions_enabled: true }, error: null }) }) }) }),
  };
  let handler: ((request: Request) => Promise<Response>) | undefined;
  const deno = {
    env: { get: () => "configured" },
    serve: (callback: (request: Request) => Promise<Response>) => { handler = callback; },
  };
  const source = readFileSync(`supabase/functions/${name}/index.ts`, "utf8").replace(/^import .*;\n/gm, "");
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  new Function("createClient", "Deno", "z", "hasSharingConsent", compiled)(() => client, deno, z, hasSharingConsent);
  if (!handler) throw new Error("Handler was not registered");
  const result = await handler(new Request("https://test/function", { method: "POST", headers: { Authorization: "Bearer test" }, body: "{}" }));
  expect(result.status).toBe(403);
  expect(fetch).not.toHaveBeenCalled();
});

it("article-recs saves a local library shelf without external calls when current consent is absent", async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("External calls must not occur"));
  const insert = vi.fn((rows: unknown[]) => ({ select: async () => ({ data: rows, error: null }) }));
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "caller" } } }) },
    rpc: async () => ({ data: true, error: null }),
    from: (table: string) => table === "profiles"
      ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { ai_suggestions_enabled: true }, error: null }) }) }) }
      : { select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) }) }), insert },
  };
  let handler: ((request: Request) => Promise<Response>) | undefined;
  const deno = {
    env: { get: () => "configured" },
    serve: (callback: (request: Request) => Promise<Response>) => { handler = callback; },
  };
  const source = readFileSync("supabase/functions/article-recs/index.ts", "utf8").replace(/^import .*;\n/gm, "");
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  new Function("createClient", "Deno", "z", "hasSharingConsent", "libraryShelf", "buildShelves", "shelfSignalText", compiled)(
    () => client, deno, z, hasSharingConsent, libraryShelf, buildShelves, shelfSignalText,
  );
  if (!handler) throw new Error("Handler was not registered");
  const result = await handler(new Request("https://test/article-recs", {
    method: "POST", headers: { Authorization: "Bearer test" }, body: JSON.stringify({ suggestions: true, concerns: "private journal text", refresh: true }),
  }));
  expect(result.status).toBe(200);
  expect(await result.json()).toMatchObject({ curated: true, cached: false });
  expect(insert).toHaveBeenCalledOnce();
  expect(fetch).not.toHaveBeenCalled();
});
