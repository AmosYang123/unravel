import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

function developerHandler(enabled?: string, email = "amosyangg@icloud.com") {
  const listUsers = vi.fn(async () => ({ data: { users: [] }, error: null }));
  const createClient = vi.fn().mockReturnValue({
    auth: {
      getUser: async () => ({ data: { user: { id: "caller", email } }, error: null }),
      admin: { listUsers },
    },
  });
  let handler: ((req: Request) => Promise<Response>) | undefined;
  const deno = {
    env: { get: (name: string) => name === "ENABLE_DEV_CONTROLS" ? enabled : "configured" },
    serve: (callback: (req: Request) => Promise<Response>) => { handler = callback; },
  };
  const source = readFileSync("supabase/functions/dev-control/index.ts", "utf8").replace(/^import .*;\n/gm, "");
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  new Function("createClient", "Deno", compiled)(createClient, deno);
  if (!handler) throw new Error("Handler was not registered");
  return { handler, createClient, listUsers };
}

const request = () => new Request("https://test/dev-control", {
  method: "POST", headers: { Authorization: "Bearer test" }, body: JSON.stringify({ action: "delete" }),
});

describe("developer controls environment gate", () => {
  it.each([undefined, "false", "TRUE", "1"])("rejects destructive actions before accessing accounts when enabled=%s", async (enabled) => {
    const { handler, createClient } = developerHandler(enabled);
    expect((await handler(request())).status).toBe(404);
    expect(createClient).not.toHaveBeenCalled();
  });
  it("still requires the developer identity in an explicitly enabled environment", async () => {
    const { handler, listUsers } = developerHandler("true", "other@example.com");
    expect((await handler(request())).status).toBe(403);
    expect(listUsers).not.toHaveBeenCalled();
  });
  it("allows the existing developer path only when explicitly enabled", async () => {
    const { handler, listUsers } = developerHandler("true");
    expect(await (await handler(request())).json()).toEqual({ affected: 0, action: "delete" });
    expect(listUsers).toHaveBeenCalledOnce();
  });
});
