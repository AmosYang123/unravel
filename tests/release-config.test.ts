import shippedEasJson from "../mobile/eas.json";
import { expect, it } from "vitest";
import { isAppLinkUrl, isPublicHttpsUrl, validateEasConfig, validateReleaseConfig, validateReleaseEnvironment } from "../mobile/lib/release-config";

it("blocks unconfigured release details without inventing defaults", () => {
  expect(validateReleaseConfig({ ownerName: "", supportEmail: "", privacyUrl: "", supportUrl: "" })).toHaveLength(4);
});

it("rejects insecure, private, placeholder and credential-bearing public URLs", () => {
  for (const value of ["", "http://unravel.app/privacy", "https://localhost/privacy", "https://10.0.0.1/privacy", "https://example.com/privacy", "https://user:pass@unravel.app/privacy", "https://host.internal/privacy"]) expect(isPublicHttpsUrl(value)).toBe(false);
  expect(isPublicHttpsUrl("https://unravel.app/privacy")).toBe(true);
});

it("rejects public client secret keys and accepts only publishable or anon keys", () => {
  const env = {
    VITE_SUPABASE_URL: "https://project.supabase.co", EXPO_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
    EXPO_PUBLIC_PASSWORD_RESET_URL: "https://unravel.app/reset-password", EXPO_PUBLIC_CONFIRMATION_URL: "https://unravel.app/auth",
    VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test", EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
  };
  expect(validateReleaseEnvironment(env)).toEqual([]);
  for (const key of ["sb_secret_test", `header.${btoa(JSON.stringify({ role: "service_role" }))}.signature`, "bad-key"]) {
    expect(validateReleaseEnvironment({ ...env, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key })).toHaveLength(1);
  }
  expect(validateReleaseEnvironment({ ...env, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: `header.${btoa(JSON.stringify({ role: "anon" }))}.signature` })).toEqual([]);
});

const completeEasProfile = {
  channel: "preview",
  env: {
    EXPO_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
    EXPO_PUBLIC_CONFIRMATION_URL: "https://unravel.app/auth",
    EXPO_PUBLIC_PASSWORD_RESET_URL: "https://unravel.app/reset-password",
  },
};
const completeEasJson = {
  build: { preview: completeEasProfile, production: { ...completeEasProfile, channel: "production" } },
};

it("passes eas.json build profiles that supply every release env var and an update channel", () => {
  expect(validateEasConfig(completeEasJson)).toEqual([]);
});

it("fails eas.json when a release profile is missing a required env var", () => {
  const missingVar = {
    build: {
      ...completeEasJson.build,
      production: { ...completeEasJson.build.production, env: { ...completeEasJson.build.production.env, EXPO_PUBLIC_CONFIRMATION_URL: "" } },
    },
  };
  expect(validateEasConfig(missingVar)).toHaveLength(1);
});

it("fails eas.json when a release profile is missing an update channel", () => {
  const missingChannel = {
    build: { ...completeEasJson.build, preview: { ...completeEasJson.build.preview, channel: "" } },
  };
  expect(validateEasConfig(missingChannel)).toHaveLength(1);
});

it("accepts the app scheme for the two auth-email destinations and nowhere else", () => {
  expect(isAppLinkUrl("unravel://auth?mode=recovery")).toBe(true);
  for (const value of ["unravel:", "unravel://user:pass@auth", "myapp://auth", "https://unravel.app/auth", ""]) expect(isAppLinkUrl(value)).toBe(false);
  const env = {
    VITE_SUPABASE_URL: "https://project.supabase.co", EXPO_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
    EXPO_PUBLIC_PASSWORD_RESET_URL: "unravel://auth?mode=recovery", EXPO_PUBLIC_CONFIRMATION_URL: "unravel://auth?mode=signup",
    VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test", EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
  };
  expect(validateReleaseEnvironment(env)).toEqual([]);
  // The Supabase URLs are public HTTPS endpoints and must not take an app link.
  for (const name of ["VITE_SUPABASE_URL", "EXPO_PUBLIC_SUPABASE_URL"]) {
    expect(validateReleaseEnvironment({ ...env, [name]: "unravel://auth" }))
      .toContain(`${name}: set a public HTTPS URL in the release environment.`);
  }
});

it("passes eas.json profiles whose auth-email URLs use the app scheme", () => {
  const appLinkEnv = { ...completeEasProfile.env, EXPO_PUBLIC_CONFIRMATION_URL: "unravel://auth?mode=signup", EXPO_PUBLIC_PASSWORD_RESET_URL: "unravel://auth?mode=recovery" };
  const easJson = { build: { preview: { ...completeEasProfile, env: appLinkEnv }, production: { ...completeEasProfile, channel: "production", env: appLinkEnv } } };
  expect(validateEasConfig(easJson)).toEqual([]);
  const supabaseAsAppLink = { build: { ...easJson.build, production: { ...easJson.build.production, env: { ...appLinkEnv, EXPO_PUBLIC_SUPABASE_URL: "unravel://auth" } } } };
  expect(validateEasConfig(supabaseAsAppLink)).toHaveLength(1);
});

it("ships an eas.json every release profile can actually build from", () => {
  expect(validateEasConfig(shippedEasJson)).toEqual([]);
});
