import { supabase } from "../integrations/supabase/client";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const REQUEST_TIMEOUT_MS = 20000;

export class EdgeFunctionRequestError extends Error {
  constructor(message: string, readonly kind: "auth" | "network" | "server") {
    super(message);
    this.name = "EdgeFunctionRequestError";
  }
}

const readResponse = async <T>(response: Response): Promise<T> => {
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
      ? payload.error
      : "The reminder service couldn't complete that request.";
    throw new EdgeFunctionRequestError(message, response.status === 401 ? "auth" : "server");
  }
  return payload as T;
};

/** Invoke a user-authenticated Edge Function with one retry for transport failures. */
export async function invokeAuthedFunction<T>(name: string, body: unknown = {}): Promise<T> {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new EdgeFunctionRequestError("The reminder service isn't configured in this build.", "server");
  }
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) {
    throw new EdgeFunctionRequestError("Your session expired. Switch accounts and sign in again.", "auth");
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/${encodeURIComponent(name)}`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${data.session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      return await readResponse<T>(response);
    } catch (requestError) {
      if (requestError instanceof EdgeFunctionRequestError) throw requestError;
      if (attempt === 1) {
        throw new EdgeFunctionRequestError(
          "Couldn't reach the reminder service. Check your connection and try again.",
          "network",
        );
      }
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new EdgeFunctionRequestError("Couldn't reach the reminder service.", "network");
}
