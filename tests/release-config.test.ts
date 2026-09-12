import { expect, it } from "vitest";
import { isPublicHttpsUrl, validateReleaseConfig, validateReleaseEnvironment } from "../mobile/lib/release-config";

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
