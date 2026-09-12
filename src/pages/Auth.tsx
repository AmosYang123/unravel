import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Check, Loader2, Lock, Mail } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import PasswordField from "@/components/PasswordField";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useAnonymousSignIn } from "@/lib/authCapabilities";
import { MIN_PASSWORD_LENGTH, describeAuthError, passwordMeetsRule } from "@/lib/password";
import { cn } from "@/lib/utils";

type Mode = "signin" | "signup" | "forgot" | "sent";

export const PASSWORD_RULE_LABEL = `At least ${MIN_PASSWORD_LENGTH} characters`;

/**
 * How long the resend button stays closed. Supabase counts confirmation emails
 * per address on its own side and answers a burst with a rate-limit error, so
 * this exists to stop us knocking at all rather than to discover the limit by
 * hitting it. It starts running the moment signup sends the first email.
 */
const RESEND_COOLDOWN_SECONDS = 60;

// Only allow redirecting back to an in-app path; reject anything that could
// escape to another origin (e.g. "//evil.com" or "https://evil.com").
const sanitizeRedirect = (from: unknown): string => {
  if (typeof from === "string" && from.startsWith("/") && !from.startsWith("//")) {
    return from;
  }
  return "/journal";
};

// Where the "confirm your email" link should land. Falls back to this app's
// own origin if the confirmation page isn't configured, so signup still works
// in local/dev setups that never set the env var.
const CONFIRMATION_URL = import.meta.env.VITE_CONFIRMATION_URL || `${window.location.origin}/`;

const isUnconfirmed = (err: unknown): boolean => {
  const raw =
    typeof err === "object" && err !== null && "message" in err && typeof err.message === "string"
      ? err.message.toLowerCase()
      : "";
  return raw.includes("email not confirmed") || raw.includes("not confirmed");
};

const AuthPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { session, loading: authLoading } = useAuth();
  // Only offered when the project actually accepts anonymous sign-ins.
  const guestEnabled = useAnonymousSignIn();
  const [mode, setMode] = useState<Mode>("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [guestError, setGuestError] = useState<string | null>(null);
  // The address the confirmation email actually went to, kept apart from the
  // input so editing the field can't quietly rewrite what we claim was sent.
  const [sentTo, setSentTo] = useState("");
  // Set when a sign-in is refused for want of a confirmation, so the offer to
  // resend appears on the sign-in form itself rather than a generic error.
  const [needsConfirming, setNeedsConfirming] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const passwordRef = useRef<HTMLDivElement | null>(null);

  const from = sanitizeRedirect((location.state as { from?: unknown } | null)?.from);

  useEffect(() => {
    if (session) navigate(from, { replace: true });
  }, [session, navigate, from]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const emailLooksUsable = email.trim().length > 3;
  const canSubmit =
    emailLooksUsable &&
    (mode === "forgot" ||
      (password.length > 0 &&
        (mode === "signin" || (passwordMeetsRule(password) && password === confirm))));

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setNotice(null);
    setGuestError(null);
    setNeedsConfirming(false);
  };

  /** Leaves the address in place and drops the password, so only one box is left to fill. */
  const goToSignIn = () => {
    switchMode("signin");
    setPassword("");
    setConfirm("");
    // Focus the box they now have to type in, rather than making them find it.
    window.setTimeout(() => passwordRef.current?.querySelector("input")?.focus(), 0);
  };

  const resend = useCallback(async () => {
    const address = (sentTo || email).trim();
    if (!address || cooldown > 0 || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    // Closed before the call, not after, so a slow network can't buy a second press.
    setCooldown(RESEND_COOLDOWN_SECONDS);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: address,
      options: { emailRedirectTo: CONFIRMATION_URL },
    });
    if (error) setError(describeAuthError(error));
    else setNotice(`Sent again to ${address}.`);
    setBusy(false);
  }, [sentTo, email, cooldown, busy]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    setNeedsConfirming(false);

    if (mode === "signup") {
      const address = email.trim();
      const { data, error } = await supabase.auth.signUp({
        email: address,
        password,
        options: { emailRedirectTo: CONFIRMATION_URL },
      });
      if (error) setError(describeAuthError(error));
      else if (data.session) {
        // Confirmation is switched off on the project: signUp handed back a
        // session, so they are already in and the auth listener takes it from
        // here. Nothing to check, nothing to come back to.
        setNotice(null);
      } else {
        // Confirmation is on. Stay on this screen and wait for them.
        setSentTo(address);
        setCooldown(RESEND_COOLDOWN_SECONDS);
        setMode("sent");
      }
    } else if (mode === "forgot") {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) {
        console.error("reset request failed", error);
        setError("We couldn't send that just now. Try again in a moment.");
      } else {
        // Deliberately neutral: says the same thing whether or not the address
        // has an account.
        setNotice("If there's an account for that address, a reset link is on its way.");
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error && isUnconfirmed(error)) {
        // Not a wrong password. Say the actual reason and put the fix here.
        console.error("auth error", error);
        setSentTo(email.trim());
        setNeedsConfirming(true);
      } else if (error) {
        setError(describeAuthError(error));
      }
    }
    setBusy(false);
  };

  // Anonymous sign-in is a project setting and is off by default. That failure
  // is not a user mistake, so it gets its own plain line.
  const describeGuestError = (err: unknown): string => {
    const raw =
      typeof err === "object" && err !== null && "message" in err && typeof err.message === "string"
        ? err.message.toLowerCase()
        : "";
    if (raw.includes("anonymous")) {
      console.error("auth error", err);
      return "Guest journals aren't switched on for this app yet. Create an account to carry on.";
    }
    return describeAuthError(err);
  };

  const continueAsGuest = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    setGuestError(null);
    const { error } = await supabase.auth.signInAnonymously();
    if (error) setGuestError(describeGuestError(error));
    setBusy(false);
  };

  const resendLabel =
    cooldown > 0 ? `Send it again in ${cooldown}s` : busy ? "Sending…" : "Send it again";

  if (mode === "sent") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-5 py-16">
        <div className="w-full max-w-sm animate-rise">
          <Mail className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
          <a href="/privacy" className="text-sm underline">Privacy policy</a>
          <h1 className="mt-6 font-display text-3xl leading-tight">Check your inbox</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            We sent a confirmation link to <span className="text-foreground">{sentTo}</span>. Open
            it and you'll land back here.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Nothing yet? It can take a minute, and it sometimes lands in spam.
          </p>

          {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
          {notice && <p className="mt-4 text-sm text-muted-foreground">{notice}</p>}

          <Button
            type="button"
            onClick={() => void resend()}
            disabled={cooldown > 0 || busy}
            variant="ghost"
            className="mt-6 h-12 w-full rounded-full border"
          >
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {resendLabel}
          </Button>

          <Button type="button" onClick={goToSignIn} className="mt-3 h-12 w-full rounded-full">
            I've confirmed — sign me in
          </Button>

          <button
            type="button"
            onClick={() => {
              switchMode("signup");
              setPassword("");
              setConfirm("");
            }}
            className="mt-6 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Use a different address
          </button>
        </div>
      </div>
    );
  }

  const heading =
    mode === "signup"
      ? "Make your private space"
      : mode === "forgot"
        ? "Reset your password"
        : "Welcome back";
  const blurb =
    mode === "signup"
      ? "Your entries, recordings and preferences sync to your private account using Supabase. Optional AI sharing is off until you allow it."
      : mode === "forgot"
        ? "Give us the address you signed up with and we'll email you a link to set a new password."
        : "Sign in to reach your entries and preferences.";
  const cta = mode === "signup" ? "Create account" : mode === "forgot" ? "Send reset link" : "Sign in";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5 py-16">
      <div className="w-full max-w-sm animate-rise">
        <Lock className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
        <a href="/privacy" className="text-sm underline">Privacy policy</a>
          <h1 className="mt-6 font-display text-3xl leading-tight">{heading}</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{blurb}</p>

        <form onSubmit={submit} className="mt-8 space-y-4">
          <div>
            <label htmlFor="email" className="text-sm text-muted-foreground">
              Email
            </label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-2 h-12 rounded-xl bg-card"
              required
            />
          </div>

          {mode !== "forgot" && (
            <div ref={passwordRef}>
              <PasswordField
                id="password"
                label="Password"
                value={password}
                onChange={setPassword}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                required
              />
            </div>
          )}

          {mode === "signup" && (
            <>
              <ul className="space-y-1.5 rounded-xl bg-secondary/60 p-4">
                <li
                  className={cn(
                    "flex items-center gap-2 text-xs",
                    passwordMeetsRule(password) ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  <Check
                    className={cn("h-3.5 w-3.5", !passwordMeetsRule(password) && "opacity-30")}
                  />
                  {PASSWORD_RULE_LABEL}
                </li>
              </ul>

              <div>
                <PasswordField
                  id="confirm"
                  label="Repeat password"
                  value={confirm}
                  onChange={setConfirm}
                  autoComplete="new-password"
                  required
                />
                {confirm.length > 0 && confirm !== password && (
                  <p className="mt-2 text-xs text-destructive">These two don't match yet.</p>
                )}
              </div>
            </>
          )}

          {needsConfirming && (
            <div className="rounded-xl bg-secondary/60 p-4">
              <p className="text-sm leading-relaxed">
                That address hasn't been confirmed yet. Open the link we emailed to{" "}
                <span className="text-foreground">{sentTo}</span>, then sign in here.
              </p>
              <Button
                type="button"
                onClick={() => void resend()}
                disabled={cooldown > 0 || busy}
                variant="ghost"
                className="mt-3 h-10 rounded-full border px-4"
              >
                {resendLabel}
              </Button>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
          {notice && <p className="text-sm text-muted-foreground">{notice}</p>}

          <Button
            type="submit"
            disabled={!canSubmit || busy || authLoading}
            className="h-12 w-full rounded-full"
          >
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {cta}
          </Button>
        </form>

        {mode === "signin" && guestEnabled && (
          <div className="mt-6 border-t pt-6">
            <Button
              type="button"
              variant="ghost"
              disabled={busy || authLoading}
              onClick={() => void continueAsGuest()}
              className="h-12 w-full rounded-full"
            >
              Continue as guest
            </Button>
            {guestError && <p className="mt-3 text-sm text-destructive">{guestError}</p>}
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              A guest journal has no email attached, so it stays on this device and can't be brought
              back if you lose access. You can add an email later in settings.
            </p>
          </div>
        )}

        <div className="mt-6 flex flex-col items-start gap-3">
          {mode === "signin" && (
            <button
              type="button"
              onClick={() => switchMode("forgot")}
              className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              Forgot your password?
            </button>
          )}

          <button
            type="button"
            onClick={() => switchMode(mode === "signup" ? "signin" : mode === "forgot" ? "signin" : "signup")}
            className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            {mode === "signup"
              ? "I already have an account"
              : mode === "forgot"
                ? "Back to sign in"
                : "I need an account"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
