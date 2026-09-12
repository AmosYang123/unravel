// One check-in reminder, on demand, to the caller's own address.
//
// Unlike send-reminders (cron-driven, shared secret, verify_jwt = false) this is
// user-driven and must verify the JWT. The recipient is read from the verified
// session and nothing else: the request body is never read, so there is no
// parameter anywhere that can point this at another address.
import { createClient } from "npm:@supabase/supabase-js@2";
import { REMINDER_SUBJECT, reminderBody } from "../_shared/reminder-email.ts";
import { sendReminderEmail } from "../_shared/gmail.ts";

// Browser origins allowed to call this function. Pinned so a random page cannot
// drive a signed-in user's session.
const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "http://localhost:5173,http://localhost:8080,http://localhost:8081")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const corsFor = (req: Request) => {
  const origin = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
};

// Counted in Postgres: edge instances are ephemeral, so in-memory counters reset.
// Deliberately tight — this sends mail, so a handful an hour is plenty for a test.
const RATE_LIMIT = 3;
const RATE_WINDOW_SECONDS = 3600;

const GENERIC_ERROR = "That didn't send. Try again in a moment.";

Deno.serve(async (req) => {
  const corsHeaders = corsFor(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Not signed in." }, 401);

    // The user's own token: row-level security decides what they can reach.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user;
    if (!user) return json({ error: "Not signed in." }, 401);

    const { data: allowed, error: rateError } = await supabase.rpc("consume_rate_limit", {
      p_bucket: "send-test-reminder",
      p_limit: RATE_LIMIT,
      p_window_seconds: RATE_WINDOW_SECONDS,
    });
    if (rateError) {
      console.error("send-test-reminder rate limit check failed:", rateError.message);
      return json({ error: GENERIC_ERROR }, 503);
    }
    if (!allowed) {
      return json({ error: "That's a few tests already. Try again in a bit." }, 429);
    }

    // Straight off the verified JWT. Guests have no address to send to.
    const email = user.email;
    if (!email) return json({ error: "There's no email on this account yet." }, 400);

    // Own row only, under the profiles_own policy — the wording has to match
    // what the scheduled reminder would say.
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("name, discreet_notifications")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError) {
      console.error("send-test-reminder profile lookup failed:", profileError.message);
      return json({ error: GENERIC_ERROR }, 500);
    }

    const name = typeof profile?.name === "string" ? profile.name : "";
    const discreet = profile?.discreet_notifications ?? true;

    // APP_URL is unset on this project, and the builder deliberately omits the
    // link when it is — the test email matches whatever the real one would be.
    const { text, html } = reminderBody(name, discreet === true, Deno.env.get("APP_URL") ?? null, Deno.env.get("REMINDER_APP_LINK") ?? null);

    await sendReminderEmail({ to: email, subject: REMINDER_SUBJECT, text, html });

    // Nothing is written back: last_reminder_sent_at belongs to the schedule.
    return json({ sent: true });
  } catch (err) {
    console.error("send-test-reminder error:", err);
    return json({ error: GENERIC_ERROR }, 500);
  }
});
