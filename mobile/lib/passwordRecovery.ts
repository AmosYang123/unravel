import { useEffect, useReducer } from "react";
import { APP_LINK_SCHEME } from "./release-config";

/**
 * Recovery finishes inside the app. Supabase mails a link on its own domain —
 * so mail clients still linkify it — and that link redirects to this value,
 * which is the app's own scheme. The new password is chosen here, not on a web
 * page.
 */
export function passwordRecoveryUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.username || url.password) return null;
    // Our own scheme hands the link straight back to this app; every other
    // scheme, http: included, belongs to somebody else.
    if (url.protocol === APP_LINK_SCHEME) return url.hostname ? url.href : null;
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" ||
      !host.includes(".") || host.endsWith(".localhost") || host.endsWith(".local") ||
      /^[\d.]+$/.test(host) || host.includes(":")) return null;
    return url.href;
  } catch {
    return null;
  }
}

/**
 * What an opened auth email turned out to be. `type` is Supabase's own word for
 * it — "recovery", "signup", "email" — and is the only thing that decides which
 * flow runs. Tokens are held, never logged.
 */
export type AuthLink =
  | { ok: true; type: string | null; accessToken: string; refreshToken: string }
  | { ok: false; type: string | null };

/**
 * integrations/supabase/client.ts leaves `flowType` at its default, which is
 * "implicit", so a redirect carries its tokens in the URL fragment. Expo's
 * `Linking.parse` reads only the query string and drops the fragment, so the
 * raw link is read here instead.
 *
 * Returns null for an ordinary deep link — a tapped reminder, say — which
 * carries neither tokens nor an auth error.
 */
export function parseAuthLink(url: string | null | undefined): AuthLink | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const fragment = new URLSearchParams(parsed.hash.replace(/^#/, ""));
  // An expired link comes back without a `type`, so the redirect URL carries
  // the same word in `mode` — enough to say which kind of link went stale.
  const type = fragment.get("type") ?? parsed.searchParams.get("mode");
  const accessToken = fragment.get("access_token");
  const refreshToken = fragment.get("refresh_token");
  if (accessToken && refreshToken) return { ok: true, type, accessToken, refreshToken };
  // An expired, reused or refused link comes back with an error where the
  // tokens would have been.
  const failed = !!(fragment.get("error") || fragment.get("error_code") || parsed.searchParams.get("error"));
  return failed ? { ok: false, type } : null;
}

/**
 * Set from the moment a recovery session is created until the new password has
 * actually been saved. The gate in app/_layout.tsx holds the auth screen up
 * while it is set, so a reset link can never quietly become an ordinary
 * signed-in session with the old password still working.
 */
let recoveryPending = false;
const listeners = new Set<() => void>();

export function setPasswordRecoveryPending(next: boolean) {
  if (recoveryPending === next) return;
  recoveryPending = next;
  listeners.forEach((l) => l());
}

export function usePasswordRecoveryPending(): boolean {
  const [, bump] = useReducer((c: number) => c + 1, 0);
  useEffect(() => {
    listeners.add(bump);
    return () => {
      listeners.delete(bump);
    };
  }, [bump]);
  return recoveryPending;
}
