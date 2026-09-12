// Destructive test-environment controls. Authorization is enforced here,
// independently of whether a modified client chooses to display the buttons.
import { createClient, type SupabaseClient, type User } from "npm:@supabase/supabase-js@2";

const DEV_EMAIL = "amosyangg@icloud.com";
const BATCH_SIZE = 100;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json" },
});

async function allUsers(admin: SupabaseClient): Promise<User[]> {
  const users: User[] = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) return users;
  }
}

async function removeRecordings(admin: SupabaseClient, userId: string): Promise<void> {
  const paths: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin.storage.from("voice-memos").list(userId, { limit: 1000, offset });
    if (error) throw error;
    paths.push(...(data ?? []).filter((item) => item.id).map((item) => `${userId}/${item.name}`));
    if (!data || data.length < 1000) break;
  }
  for (let index = 0; index < paths.length; index += BATCH_SIZE) {
    const { error } = await admin.storage.from("voice-memos").remove(paths.slice(index, index + BATCH_SIZE));
    if (error) throw error;
  }
}

Deno.serve(async (req) => {
  if (Deno.env.get("ENABLE_DEV_CONTROLS") !== "true") return json({ error: "Developer controls are disabled." }, 404);
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const authorization = req.headers.get("Authorization");
  if (!authorization) return json({ error: "Not signed in." }, 401);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) return json({ error: "Developer controls aren't configured." }, 503);

  const caller = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: auth, error: authError } = await caller.auth.getUser();
  if (authError || !auth.user) return json({ error: "Your session expired. Sign in again." }, 401);
  if (auth.user.email?.toLowerCase() !== DEV_EMAIL) return json({ error: "Developer access required." }, 403);

  let requestBody: unknown;
  try {
    requestBody = await req.json();
  } catch {
    return json({ error: "Choose a developer action." }, 400);
  }
  const action = requestBody && typeof requestBody === "object" && "action" in requestBody
    ? (requestBody as { action: unknown }).action
    : null;
  if (action !== "reset" && action !== "delete") return json({ error: "Unknown developer action." }, 400);

  try {
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const targets = (await allUsers(admin)).filter((user) => user.id !== auth.user.id);

    for (const target of targets) await removeRecordings(admin, target.id);

    if (action === "delete") {
      for (const target of targets) {
        const { error } = await admin.auth.admin.deleteUser(target.id);
        if (error) throw error;
      }
      return json({ affected: targets.length, action });
    }

    for (let index = 0; index < targets.length; index += BATCH_SIZE) {
      const ids = targets.slice(index, index + BATCH_SIZE).map((user) => user.id);
      if (!ids.length) continue;
      const { error: entriesError } = await admin.from("entries").delete().in("user_id", ids);
      if (entriesError) throw entriesError;
      const { error: profilesError } = await admin.from("profiles").update({
        name: "",
        theme: "system",
        reminder_mode: "days",
        reminder_days: [1, 3, 5],
        reminder_time: "21:00",
        reminder_email_enabled: false,
        lock_enabled: false,
        passcode: "",
        music_tastes: [],
        music_artists: [],
        year_level: null,
        focus_areas: [],
        goals: [],
        interests: [],
        onboarded_at: null,
      }).in("id", ids);
      if (profilesError) throw profilesError;
    }
    return json({ affected: targets.length, action });
  } catch (error) {
    console.error("dev-control failed", error instanceof Error ? error.message : error);
    return json({ error: "The developer action didn't finish. No further accounts were changed." }, 500);
  }
});
