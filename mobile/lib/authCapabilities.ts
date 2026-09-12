import { useEffect, useState } from "react";

// Both are guaranteed present: integrations/supabase/client.ts throws on import
// if either is missing, and nothing can reach this module without it.
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

function readsAnonymousEnabled(body: unknown): boolean {
  if (typeof body !== "object" || body === null) return false;
  const external = (body as { external?: unknown }).external;
  if (typeof external !== "object" || external === null) return false;
  return (external as { anonymous_users?: unknown }).anonymous_users === true;
}

/**
 * Anonymous sign-in is a project setting and is off by default. The SDK cannot
 * report it, so the only other way to learn it is to call `signInAnonymously`
 * and read the failure — which means finding out in front of someone, after
 * they have already pressed the button. `/auth/v1/settings` is public and says
 * so directly, so the offer can simply not be made when it would not work.
 *
 * Asked once per app launch and shared, because the answer cannot change while
 * the app is open.
 */
let pending: Promise<boolean> | null = null;

function anonymousSignInEnabled(): Promise<boolean> {
  pending ??= fetch(`${SUPABASE_URL}/auth/v1/settings`, {
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY },
  })
    .then((res) => (res.ok ? (res.json() as Promise<unknown>) : null))
    .then(readsAnonymousEnabled)
    .catch(() => false);
  return pending;
}

/** False until the answer arrives, so the button never flashes in and out. */
export const useAnonymousSignIn = (): boolean => {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void anonymousSignInEnabled().then((on) => {
      if (!cancelled) setEnabled(on);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return enabled;
};
