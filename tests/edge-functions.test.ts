import { readFileSync } from "node:fs";
import ts from "typescript";
import { expect, it, vi } from "vitest";

const removed = ["entry-advice", "transcribe-voice", "normalize-tag", "spotify-songs"];

it.each(removed)("%s is permanently disabled without an external request", async (name) => {
  const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("must not be called"));
  let handler: ((request: Request) => Response) | undefined;
  const deno = { env: { get: () => undefined }, serve: (callback: (request: Request) => Response) => { handler = callback; } };
  const source = readFileSync(`supabase/functions/${name}/index.ts`, "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  new Function("Deno", compiled)(deno);
  expect(handler).toBeDefined();
  const response = handler!(new Request("https://test/function", { method: "POST", body: "{}" }));
  expect(response.status).toBe(410);
  expect(await response.json()).toMatchObject({ error: expect.stringMatching(/removed/) });
  expect(fetch).not.toHaveBeenCalled();
});
