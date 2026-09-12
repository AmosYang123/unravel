interface ConsentClient {
  from(table: "profiles"): {
    select(columns: string): {
      eq(column: string, value: string): {
        maybeSingle(): PromiseLike<{ data: unknown; error: unknown }>;
      };
    };
  };
}

/** Fail closed, including older profiles whose default was previously on. */
export async function hasSharingConsent(client: ConsentClient, userId: string): Promise<boolean> {
  try {
    const { data, error } = await client.from("profiles")
      .select("ai_suggestions_enabled, ai_consent_version").eq("id", userId).maybeSingle();
    return !error && typeof data === "object" && data !== null
      && "ai_suggestions_enabled" in data && data.ai_suggestions_enabled === true
      && "ai_consent_version" in data && data.ai_consent_version === "2026-09-11";
  } catch {
    return false;
  }
}
