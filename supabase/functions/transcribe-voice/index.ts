import { hasSharingConsent } from "../_shared/sharing-consent.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";

const SUMMARY_THRESHOLD_SECONDS = 300; // 5 minutes
const TEXT_MODEL = "openai/gpt-oss-20b";

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

const bodySchema = z.object({ entryId: z.string().uuid() });

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

    const groqKey = Deno.env.get("GROQ_API_KEY");
    if (!groqKey) return json({ error: "Transcription is not configured." }, 500);

    // The user's own token: row-level security decides what they can reach.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: user } = await supabase.auth.getUser();
    if (!user?.user) return json({ error: "Not signed in." }, 401);

    if (!await hasSharingConsent(supabase, user.user.id)) {
      return json({ error: "Enable AI suggestions in Settings after reviewing the data-sharing notice to use this feature." }, 403);
    }

    const { data: allowed, error: rateError } = await supabase.rpc("consume_rate_limit", {
      p_bucket: "transcribe-voice",
      p_limit: RATE_LIMIT,
      p_window_seconds: RATE_WINDOW_SECONDS,
    });
    if (rateError) {
      console.error("transcribe-voice rate limit check failed:", rateError.message);
      return json({ error: GENERIC_ERROR }, 503);
    }
    if (!allowed) {
      return json({ error: "Too many requests right now — try again in a moment." }, 429);
    }

    const parsedBody = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsedBody.success) return json({ error: "Which entry?" }, 400);
    const entryId = parsedBody.data.entryId;

    const { data: entry, error: entryError } = await supabase
      .from("entries")
      .select("id, audio_path, audio_seconds, transcript")
      .eq("id", entryId)
      .maybeSingle();

    if (entryError) {
      console.error("transcribe-voice entry lookup failed:", entryError.message);
      return json({ error: GENERIC_ERROR }, 400);
    }
    if (!entry?.audio_path) return json({ error: "This entry has no recording." }, 400);

    const { data: file, error: downloadError } = await supabase.storage
      .from("voice-memos")
      .download(entry.audio_path);
    if (downloadError || !file) return json({ error: "The recording could not be read." }, 400);
    if (file.size < 2048) return json({ error: "That recording is too short to transcribe." }, 400);

    const ext = entry.audio_path.split(".").pop()?.toLowerCase() || "webm";
    const form = new FormData();
    form.append("model", "whisper-large-v3-turbo");
    form.append("file", file, `memo.${ext}`);

    const sttRes = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${groqKey}` },
      body: form,
    });

    if (!sttRes.ok) {
      console.error(`Transcription failed [${sttRes.status}]`);
      const message =
        sttRes.status === 429
          ? "Too many requests right now — try again in a moment."
          : sttRes.status === 402
            ? "Transcription credits have run out."
            : "The recording couldn't be transcribed just now.";
      return json({ error: message }, sttRes.status);
    }

    const sttData = await sttRes.json();
    const transcript = typeof sttData?.text === "string" ? sttData.text.trim() : "";
    if (!transcript) return json({ error: "No words were found in that recording." }, 422);

    // Long memos also get a short readable summary.
    let summary: string | null = null;
    const seconds = Number(entry.audio_seconds ?? 0);
    if (seconds > SUMMARY_THRESHOLD_SECONDS || transcript.length > 3000) {
      if (!groqKey) {
        console.error("transcribe-voice summary skipped: GROQ_API_KEY is not configured");
      } else {
        const chatRes = await fetch(
          "https://api.groq.com/openai/v1/chat/completions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${groqKey}`,
            },
            body: JSON.stringify({
              model: TEXT_MODEL,
              messages: [
                {
                  role: "system",
                  content:
                      "You condense a person's private voice journal into a short readable recap. " +
                      "Use their own words and second person ('you'). 3-5 short sentences or bullets. " +
                      "No advice, no diagnosis, no encouragement, no judgement — just what they talked about and how they sounded.",
                },
                {
                  role: "user",
                  content: transcript.slice(0, 24000),
                },
              ],
            }),
          },
        );

        if (chatRes.ok) {
          const chatData = await chatRes.json();
          const text = chatData?.choices?.[0]?.message?.content;
          if (typeof text === "string" && text.trim()) summary = text.trim();
        } else {
          console.error(`Summary failed [${chatRes.status}]`);
        }
      }
    }

    const { error: updateError } = await supabase
      .from("entries")
      .update({
        transcript,
        transcript_summary: summary,
        transcript_status: "done",
      })
      .eq("id", entryId);

    if (updateError) {
      console.error("transcribe-voice transcript save failed:", updateError.message);
      return json({ error: GENERIC_ERROR }, 400);
    }

    return json({ transcript, summary });
  } catch (err) {
    console.error("transcribe-voice error:", err);
    return json({ error: GENERIC_ERROR }, 500);
  }
});
