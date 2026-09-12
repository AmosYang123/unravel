import { hasSharingConsent } from "../_shared/sharing-consent.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";

const MODEL = "openai/gpt-oss-20b";

type Plan = { headline: string; encouragement: string; steps: string[] };

const SYSTEM = `You are a warm, grounded companion inside a private journal app used by high school students.
You write short, specific advice about ONE journal entry.

Rules:
- Never diagnose, never moralize, never use motivational-poster language.
- No streaks, no productivity pressure, no "you should journal more".
- Reference concrete details the person actually wrote, in their own vocabulary.
- Tone: calm, plain, human. Never clinical, never bubbly.
- Steps must be small and doable in the next hour.
- If the entry mentions self-harm or crisis, gently name it and suggest telling one trusted person or a crisis line, without alarm.

Respond with JSON only: {"headline": string (max 8 words), "encouragement": string (2-3 sentences), "steps": string[] (3 items, each one sentence)}.`;

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
const RATE_LIMIT = 20;
const RATE_WINDOW_SECONDS = 3600;

const GENERIC_ERROR = "Something went wrong. Try again in a moment.";

const bodySchema = z.object({
  summary: z.string(),
  variation: z.number().finite().optional(),
});

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

    const apiKey = Deno.env.get("GROQ_API_KEY");
    if (!apiKey) return json({ error: "AI is not configured." }, 500);

    // The user's own token: row-level security decides what they can reach.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return json({ error: "Not signed in." }, 401);

    if (!await hasSharingConsent(supabase, auth.user.id)) {
      return json({ error: "Enable AI suggestions in Settings after reviewing the data-sharing notice to use this feature." }, 403);
    }

    const { data: allowed, error: rateError } = await supabase.rpc("consume_rate_limit", {
      p_bucket: "entry-advice",
      p_limit: RATE_LIMIT,
      p_window_seconds: RATE_WINDOW_SECONDS,
    });
    if (rateError) {
      console.error("entry-advice rate limit check failed:", rateError.message);
      return json({ error: GENERIC_ERROR }, 503);
    }
    if (!allowed) {
      return json({ error: "Too many requests right now — try again in a moment." }, 429);
    }

    const parsedBody = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsedBody.success) return json({ error: "Nothing to read in this entry." }, 400);
    const summary = parsedBody.data.summary.slice(0, 6000);
    if (!summary.trim()) return json({ error: "Nothing to read in this entry." }, 400);
    const variation = parsedBody.data.variation ?? 0;

    const res = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: "system", content: SYSTEM },
            {
              role: "user",
              content: `Journal entry:\n${summary}\n\nWrite advice and encouragement as JSON.${
                    variation > 0
                      ? ` Take a different angle than a previous attempt (variation ${variation}).`
                      : ""
                  }`,
            },
          ],
          response_format: { type: "json_object" },
          temperature: variation > 0 ? 1.1 : 0.9,
        }),
      },
    );

    if (!res.ok) {
      console.error(`Groq text API failed [${res.status}]`);
      const message =
        res.status === 429
          ? "Too many requests right now — try again in a moment."
          : res.status === 401 || res.status === 403
            ? "The Groq API key was rejected."
            : "The AI couldn't answer just now.";
      return json({ error: message, status: res.status }, res.status);
    }

    const data = await res.json();
    const raw = typeof data?.choices?.[0]?.message?.content === "string"
      ? data.choices[0].message.content
      : "";
    let parsed: Partial<Plan> = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.error("Unparseable model output");
      return json({ error: "The AI reply came back malformed." }, 502);
    }

    const steps = Array.isArray(parsed.steps)
      ? parsed.steps.filter((s): s is string => typeof s === "string" && s.trim().length > 0).slice(0, 4)
      : [];

    if (!parsed.encouragement || steps.length === 0) {
      return json({ error: "The AI reply came back empty." }, 502);
    }

    return json({
      headline: (parsed.headline ?? "For right now").toString().slice(0, 120),
      encouragement: parsed.encouragement.toString(),
      steps,
    });
  } catch (err) {
    console.error("entry-advice error:", err);
    return json({ error: GENERIC_ERROR }, 500);
  }
});
