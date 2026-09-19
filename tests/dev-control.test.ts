import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

interface RoleLookup {
  data: { role: string } | null;
  error: { message: string } | null;
}

const adminRole: RoleLookup = { data: { role: "admin" }, error: null };

function developerHandler(enabled?: string, role: RoleLookup = adminRole) {
  const maybeSingle = vi.fn(async () => role);
  // Only the caller's client can answer the role question; the service-role client
  // deliberately cannot, so an authorization check on the wrong client throws.
  const callerFrom = vi.fn(() => ({
    select: () => ({ eq: () => ({ eq: () => ({ maybeSingle }) }) }),
  }));
  const listUsers = vi.fn(async () => ({
    data: { users: [{ id: "caller" }, { id: "other" }] },
    error: null,
  }));
  const deleteUser = vi.fn(async () => ({ error: null }));
  const entriesDelete = vi.fn(async () => ({ error: null }));
  const profilesUpdate = vi.fn(async () => ({ error: null }));
  const adminFrom = vi.fn((table: string) => ({
    delete: () => ({ in: entriesDelete }),
    update: () => ({ in: profilesUpdate }),
    table,
  }));
  const caller = { auth: { getUser: async () => ({ data: { user: { id: "caller" } }, error: null }) }, from: callerFrom };
  const admin = {
    auth: { admin: { listUsers, deleteUser } },
    from: adminFrom,
    storage: { from: () => ({ list: async () => ({ data: [], error: null }), remove: async () => ({ error: null }) }) },
  };
  const createClient = vi.fn((_url: string, key: string) => (key === "service-role-key" ? admin : caller));
  let handler: ((req: Request) => Promise<Response>) | undefined;
  const deno = {
    env: {
      get: (name: string) => {
        if (name === "ENABLE_DEV_CONTROLS") return enabled;
        if (name === "SUPABASE_SERVICE_ROLE_KEY") return "service-role-key";
        return "configured";
      },
    },
    serve: (callback: (req: Request) => Promise<Response>) => { handler = callback; },
  };
  const source = readFileSync("supabase/functions/dev-control/index.ts", "utf8").replace(/^import .*;\n/gm, "");
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  new Function("createClient", "Deno", compiled)(createClient, deno);
  if (!handler) throw new Error("Handler was not registered");
  return { handler, createClient, callerFrom, maybeSingle, listUsers, deleteUser };
}

const request = (action = "delete") => new Request("https://test/dev-control", {
  method: "POST", headers: { Authorization: "Bearer test" }, body: JSON.stringify({ action }),
});

describe("developer controls environment gate", () => {
  it.each([undefined, "false", "TRUE", "1"])("rejects destructive actions before accessing accounts when enabled=%s", async (enabled) => {
    const { handler, createClient } = developerHandler(enabled);
    expect((await handler(request())).status).toBe(404);
    expect(createClient).not.toHaveBeenCalled();
  });
});

describe("developer controls authorization", () => {
  it("refuses a signed-in caller without an admin role row", async () => {
    const { handler, listUsers } = developerHandler("true", { data: null, error: null });
    const response = await handler(request());
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Developer access required." });
    expect(listUsers).not.toHaveBeenCalled();
  });
  it("fails closed when the role lookup errors, even if a row comes back", async () => {
    const { handler, listUsers } = developerHandler("true", { data: { role: "admin" }, error: { message: "permission denied" } });
    expect((await handler(request())).status).toBe(403);
    expect(listUsers).not.toHaveBeenCalled();
  });
  it("reads the caller's own admin row through the caller's client", async () => {
    const { handler, callerFrom, maybeSingle } = developerHandler("true");
    await handler(request());
    expect(callerFrom).toHaveBeenCalledWith("user_roles");
    expect(maybeSingle).toHaveBeenCalledOnce();
  });
  it("runs the destructive delete path for an admin caller, skipping the caller's own account", async () => {
    const { handler, listUsers, deleteUser } = developerHandler("true");
    expect(await (await handler(request())).json()).toEqual({ affected: 1, action: "delete" });
    expect(listUsers).toHaveBeenCalledOnce();
    expect(deleteUser).toHaveBeenCalledExactlyOnceWith("other");
  });
  it("runs the reset path for an admin caller without deleting accounts", async () => {
    const { handler, deleteUser } = developerHandler("true");
    expect(await (await handler(request("reset"))).json()).toEqual({ affected: 1, action: "reset" });
    expect(deleteUser).not.toHaveBeenCalled();
  });
});
