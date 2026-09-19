import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

/** What one `storage.list()` page can hold, mirroring the handler's page size. */
interface StorageEntry { id: string | null; name: string }
/** A folder tree, answered per prefix — children of a folder entry therefore only
    appear once the handler lists that folder in a later call. */
type StorageTree = (prefix: string) => StorageEntry[];

const files = (count: number, prefix = ""): StorageEntry[] =>
  Array.from({ length: count }, (_, i) => ({ id: String(i), name: `${prefix}${i}.m4a` }));

// Execute the actual Edge Function handler with isolated Supabase dependencies.
function deletionHandler(options: { listFails?: boolean; removeFails?: boolean; removeFailsAt?: number; userFails?: boolean; signedIn?: boolean; count?: number; tree?: StorageTree } = {}) {
  const list = vi.fn(async (prefix: string, { offset }: { offset: number }) => ({
    data: options.tree
      ? options.tree(prefix).slice(offset, offset + 1000)
      : Array.from({ length: Math.min(1000, Math.max(0, (options.count ?? 1) - offset)) }, (_, i) => ({ id: String(offset + i), name: `${offset + i}.m4a` })),
    error: options.listFails ? { message: "storage unavailable" } : null,
  }));
  let removalCount = 0;
  const remove = vi.fn(async () => ({ error: options.removeFails || ++removalCount === options.removeFailsAt ? { message: "remove failed" } : null }));
  const deleteUser = vi.fn(async () => ({ error: options.userFails ? { message: "delete failed" } : null }));
  const admin = { storage: { from: () => ({ list, remove }) }, auth: { admin: { deleteUser } } };
  const caller = { auth: { getUser: async () => ({ data: { user: options.signedIn === false ? null : { id: "caller" } }, error: null }) } };
  const createClient = vi.fn().mockReturnValueOnce(caller).mockReturnValue(admin);
  let handler: ((req: Request) => Promise<Response>) | undefined;
  const deno = { env: { get: () => "configured" }, serve: (callback: (req: Request) => Promise<Response>) => { handler = callback; } };
  const source = readFileSync("supabase/functions/delete-account/index.ts", "utf8").replace(/^import .*;\n/gm, "");
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  new Function("createClient", "Deno", compiled)(createClient, deno);
  if (!handler) throw new Error("Handler was not registered");
  return { handler, list, remove, deleteUser };
}

const request = () => new Request("https://test/delete-account", { method: "POST", headers: { Authorization: "Bearer test" }, body: JSON.stringify({ userId: "someone-else" }) });

describe("permanent account deletion", () => {
  it("deletes only the authenticated caller, after removing every page of recordings", async () => {
    const { handler, list, remove, deleteUser } = deletionHandler({ count: 1001 });
    const result = await handler(request());
    expect(await result.json()).toEqual({ deleted: true });
    expect(list).toHaveBeenCalledTimes(2);
    expect(remove).toHaveBeenCalledTimes(2);
    expect(remove).toHaveBeenNthCalledWith(1, Array.from({ length: 1000 }, (_, i) => `caller/${i}.m4a`));
    expect(remove).toHaveBeenNthCalledWith(2, ["caller/1000.m4a"]);
    expect(deleteUser).toHaveBeenCalledWith("caller");
    expect(remove.mock.invocationCallOrder[0]).toBeLessThan(deleteUser.mock.invocationCallOrder[0]!);
  });
  it("keeps the identity when a later recording removal batch fails", async () => {
    const { handler, remove, deleteUser } = deletionHandler({ count: 1001, removeFailsAt: 2 });
    expect((await handler(request())).status).toBe(500);
    expect(remove).toHaveBeenCalledTimes(2);
    expect(deleteUser).not.toHaveBeenCalled();
  });
  it.each([{ listFails: true }, { removeFails: true }])("does not delete the identity when recording cleanup fails: %j", async (options) => {
    const { handler, deleteUser } = deletionHandler(options);
    expect((await handler(request())).status).toBe(500);
    expect(deleteUser).not.toHaveBeenCalled();
  });
  it("never reports success if identity deletion fails", async () => {
    const { handler } = deletionHandler({ userFails: true });
    const result = await handler(request());
    expect(result.status).toBe(500);
    expect(await result.json()).not.toHaveProperty("deleted");
  });
  it("removes recordings nested below the caller's folder, at every depth", async () => {
    // `list()` is not recursive: `sub` and `deeper` come back as folder entries with
    // no id, and their contents only appear when those prefixes are listed in turn.
    const tree: StorageTree = (prefix) => prefix === "caller"
      ? [{ id: "0", name: "0.m4a" }, { id: null, name: "sub" }]
      : prefix === "caller/sub"
        ? [{ id: null, name: "deeper" }, { id: "1", name: "1.m4a" }]
        : [{ id: "2", name: "2.m4a" }];
    const { handler, list, remove, deleteUser } = deletionHandler({ tree });
    expect(await (await handler(request())).json()).toEqual({ deleted: true });
    expect(list.mock.calls.map(([prefix]) => prefix)).toEqual(["caller", "caller/sub", "caller/sub/deeper"]);
    expect(remove).toHaveBeenCalledOnce();
    expect([...remove.mock.calls[0]![0]].sort()).toEqual(["caller/0.m4a", "caller/sub/1.m4a", "caller/sub/deeper/2.m4a"]);
    expect(deleteUser).toHaveBeenCalledWith("caller");
  });
  it("pages through a nested folder the same way it pages the root", async () => {
    const nested = files(1001);
    const { handler, list, remove } = deletionHandler({
      tree: (prefix) => (prefix === "caller" ? [{ id: null, name: "sub" }] : nested),
    });
    expect(await (await handler(request())).json()).toEqual({ deleted: true });
    expect(list.mock.calls).toEqual([["caller", { limit: 1000, offset: 0 }], ["caller/sub", { limit: 1000, offset: 0 }], ["caller/sub", { limit: 1000, offset: 1000 }]]);
    expect(remove).toHaveBeenCalledTimes(2);
    expect(remove).toHaveBeenNthCalledWith(1, nested.slice(0, 1000).map((item) => `caller/sub/${item.name}`));
    expect(remove).toHaveBeenNthCalledWith(2, ["caller/sub/1000.m4a"]);
  });
  it("reports a failure rather than deleting the identity when a nested removal fails", async () => {
    const { handler, remove, deleteUser } = deletionHandler({
      removeFails: true,
      tree: (prefix) => (prefix === "caller" ? [{ id: null, name: "sub" }] : [{ id: "1", name: "1.m4a" }]),
    });
    expect((await handler(request())).status).toBe(500);
    expect(remove).toHaveBeenCalledWith(["caller/sub/1.m4a"]);
    expect(deleteUser).not.toHaveBeenCalled();
  });
  it("gives up on an endlessly nested tree instead of looping forever", async () => {
    const { handler, list, deleteUser } = deletionHandler({ tree: () => [{ id: null, name: "sub" }] });
    expect((await handler(request())).status).toBe(500);
    expect(list.mock.calls.length).toBeLessThanOrEqual(16);
    expect(deleteUser).not.toHaveBeenCalled();
  });
  it("rejects an invalid session without touching storage", async () => {
    const { handler, list, deleteUser } = deletionHandler({ signedIn: false });
    expect((await handler(request())).status).toBe(401);
    expect(list).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
  });
});
