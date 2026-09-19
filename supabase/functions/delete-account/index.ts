// Permanently removes the authenticated caller, their database rows (through
// the existing foreign-key cascades), and voice recordings owned by them.
import { createClient } from "npm:@supabase/supabase-js@2";

/** How far below `<uid>/` a recording may sit before cleanup gives up. */
const MAX_FOLDER_DEPTH = 8;

const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "http://localhost:5173,http://localhost:8080,http://localhost:8081")
  .split(",").map((origin) => origin.trim()).filter(Boolean);

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin") ?? "";
  const headers = {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0] ?? "",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
    "Content-Type": "application/json",
  };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const authorization = req.headers.get("Authorization");
  if (!authorization) return json({ error: "Not signed in." }, 401);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) return json({ error: "Account deletion isn't configured." }, 503);

  const caller = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: auth, error: authError } = await caller.auth.getUser();
  if (authError || !auth.user) return json({ error: "Your session expired. Sign in and try again." }, 401);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  // `list()` only returns the immediate children of a prefix, but the storage insert
  // policy allows writing to any depth under `<uid>/`, so a nested recording would
  // outlive the account. Walk into every folder entry (no `id`) instead.
  const paths: string[] = [];
  const pending: { prefix: string; depth: number }[] = [{ prefix: auth.user.id, depth: 0 }];
  while (pending.length) {
    const { prefix, depth } = pending.pop()!;
    for (let offset = 0; ; offset += 1000) {
      const { data: recordings, error: listError } = await admin.storage
        .from("voice-memos")
        .list(prefix, { limit: 1000, offset });
      if (listError) {
        console.error("delete-account recording list failed", listError.message);
        return json({ error: "Recording cleanup did not finish. Your account has not been deleted. Please try again." }, 500);
      }
      for (const item of recordings ?? []) {
        if (item.id) paths.push(`${prefix}/${item.name}`);
        // A hostile tree must not spin the function forever. Real paths are
        // `<uid>/<uuid>.<ext>`, so anything this deep is reported rather than
        // silently left behind.
        else if (depth >= MAX_FOLDER_DEPTH) {
          console.error("delete-account recording tree too deep", prefix);
          return json({ error: "Recording cleanup did not finish. Your account has not been deleted. Please try again." }, 500);
        } else pending.push({ prefix: `${prefix}/${item.name}`, depth: depth + 1 });
      }
      if (!recordings || recordings.length < 1000) break;
    }
  }
  for (let index = 0; index < paths.length; index += 1000) {
    const { error: removeError } = await admin.storage.from("voice-memos").remove(paths.slice(index, index + 1000));
    if (removeError) {
      console.error("delete-account recording removal failed", removeError.message);
      return json({ error: "Recording cleanup did not finish. Your account has not been deleted. Please try again." }, 500);
    }
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(auth.user.id);
  if (deleteError) {
    console.error("delete-account user removal failed", deleteError.message);
    return json({ error: "We couldn't delete your account. Please try again." }, 500);
  }
  return json({ deleted: true });
});
