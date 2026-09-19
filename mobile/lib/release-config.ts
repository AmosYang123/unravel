// Public values only: this module is bundled into both clients.
export const releaseConfig = {
  ownerName: "Amos Yang and Faye Yang",
  supportEmail: "unravelreminders+support@gmail.com",
  privacyUrl: "https://officialunravel.vercel.app/privacy",
  supportUrl: "https://officialunravel.vercel.app/support",
};

// The app's own URL scheme, registered in mobile/app.json. Supabase redirects
// its auth emails into it so the link finishes inside the app.
export const APP_LINK_SCHEME = "unravel:";

/** A link back into this app: our scheme, a route to land on, no credentials. */
export function isAppLinkUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === APP_LINK_SCHEME && !!url.hostname && !url.username && !url.password;
  } catch { return false; }
}

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

// Supabase mails these two and they are consumed by the app itself, so the app
// scheme is as valid here as a published page. Every other URL stays HTTPS.
const AUTH_EMAIL_URL_VARS: readonly string[] = ["EXPO_PUBLIC_CONFIRMATION_URL", "EXPO_PUBLIC_PASSWORD_RESET_URL"];
const acceptsUrl = (name: string, value: string): boolean =>
  AUTH_EMAIL_URL_VARS.includes(name) ? isAppLinkUrl(value) || isPublicHttpsUrl(value) : isPublicHttpsUrl(value);
const urlRequirement = (name: string): string =>
  AUTH_EMAIL_URL_VARS.includes(name) ? `an ${APP_LINK_SCHEME}// app link or a public HTTPS URL` : "a public HTTPS URL";

export function validateReleaseEnvironment(env: Record<string, string | undefined>): string[] {
  const errors: string[] = [];
  for (const name of ["VITE_SUPABASE_URL", "EXPO_PUBLIC_SUPABASE_URL", "EXPO_PUBLIC_PASSWORD_RESET_URL", "EXPO_PUBLIC_CONFIRMATION_URL"]) {
    if (!acceptsUrl(name, env[name] ?? "")) errors.push(`${name}: set ${urlRequirement(name)} in the release environment.`);
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

// The profiles EAS actually ships to reviewers or users; "development" only
// ever runs against a dev client on a trusted machine, so it is not checked.
const RELEASE_EAS_PROFILES = ["preview", "production"] as const;
// The Supabase URL must be a real public HTTPS page; the two auth-email
// destinations may also be app links. The publishable key just needs to be present.
const REQUIRED_EAS_URL_VARS = ["EXPO_PUBLIC_SUPABASE_URL", "EXPO_PUBLIC_CONFIRMATION_URL", "EXPO_PUBLIC_PASSWORD_RESET_URL"] as const;

export function validateEasConfig(easJson: unknown): string[] {
  const errors: string[] = [];
  const build = typeof easJson === "object" && easJson !== null ? (easJson as { build?: unknown }).build : undefined;
  for (const profile of RELEASE_EAS_PROFILES) {
    const profileConfig = typeof build === "object" && build !== null ? (build as Record<string, unknown>)[profile] : undefined;
    if (typeof profileConfig !== "object" || profileConfig === null) {
      errors.push(`eas.json build.${profile}: set a build profile before releasing.`);
      continue;
    }
    const env = (profileConfig as { env?: unknown }).env;
    const envRecord = typeof env === "object" && env !== null ? (env as Record<string, unknown>) : {};
    for (const name of REQUIRED_EAS_URL_VARS) {
      if (!acceptsUrl(name, typeof envRecord[name] === "string" ? (envRecord[name] as string) : "")) {
        errors.push(`eas.json build.${profile}.env.${name}: set ${urlRequirement(name)} for the release build.`);
      }
    }
    const publishableKey = envRecord.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (typeof publishableKey !== "string" || !publishableKey.trim()) {
      errors.push(`eas.json build.${profile}.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: set the release Supabase publishable key.`);
    }
    const channel = (profileConfig as { channel?: unknown }).channel;
    if (typeof channel !== "string" || !channel.trim()) {
      errors.push(`eas.json build.${profile}.channel: set an EAS Update channel for this profile.`);
    }
  }
  return errors;
}
