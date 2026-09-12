// Public values only: this module is bundled into both clients.
export const releaseConfig = {
  ownerName: "Amos Yang and Faye Yang",
  supportEmail: "unravelreminders+support@gmail.com",
  privacyUrl: "",
  supportUrl: "",
};

export function isPublicHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname;
    return url.protocol === "https:" && !url.username && !url.password
      && host.includes(".") && !/^[\d.]+$/.test(host) && !host.includes(":")
      && !/(^|\.)(localhost|local|internal|invalid|test|example)$/.test(host)
      && !/(^|\.)example\.(com|net|org)$/.test(host);
  } catch { return false; }
}

export function validateReleaseConfig(config: typeof releaseConfig): string[] {
  const errors: string[] = [];
  if (!config.ownerName.trim()) errors.push("ownerName: enter the responsible app owner's public name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.supportEmail)) errors.push("supportEmail: enter a working support email address.");
  for (const key of ["privacyUrl", "supportUrl"] as const) {
    if (!isPublicHttpsUrl(config[key])) {
      errors.push(`${key}: enter the published public HTTPS page URL (no login required).`);
    }
  }
  return errors;
}

export function validateReleaseEnvironment(env: Record<string, string | undefined>): string[] {
  const errors: string[] = [];
  for (const name of ["VITE_SUPABASE_URL", "EXPO_PUBLIC_SUPABASE_URL", "EXPO_PUBLIC_PASSWORD_RESET_URL", "EXPO_PUBLIC_CONFIRMATION_URL"]) {
    if (!isPublicHttpsUrl(env[name] ?? "")) errors.push(`${name}: set a public HTTPS URL in the release environment.`);
  }
  if (env.VITE_SUPABASE_URL && env.EXPO_PUBLIC_SUPABASE_URL && env.VITE_SUPABASE_URL !== env.EXPO_PUBLIC_SUPABASE_URL) errors.push("Web and native Supabase URLs must target the same release project.");
  for (const name of ["VITE_SUPABASE_PUBLISHABLE_KEY", "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]) {
    const key = env[name] ?? "";
    let publicKey = /^sb_publishable_[A-Za-z0-9_-]+$/.test(key);
    if (!publicKey && key.split(".").length === 3) {
      try {
        const payload: unknown = JSON.parse(atob((key.split(".")[1] ?? "").replace(/-/g, "+").replace(/_/g, "/")));
        publicKey = typeof payload === "object" && payload !== null && "role" in payload && payload.role === "anon";
      } catch { publicKey = false; }
    }
    if (!publicKey) errors.push(`${name}: use only a publishable key or legacy anon key; secret/service_role keys must never ship in clients.`);
  }
  return errors;
}
