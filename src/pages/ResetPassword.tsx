import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import PasswordField from "@/components/PasswordField";
import { supabase } from "@/integrations/supabase/client";
import { PASSWORD_RULE_LABEL } from "@/pages/Auth";
import { describeAuthError, passwordMeetsRule } from "@/lib/password";
import { cn } from "@/lib/utils";

// How long to wait for the Supabase client to turn the token in the URL into a
// recovery session before we call the link bad.
const TOKEN_GRACE_MS = 3000;

type Status = "checking" | "ready" | "invalid";

const ResetPassword = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let done = false;
    const settle = (next: Status) => {
      if (!done) {
        done = true;
        setStatus(next);
      }
    };

    // Supabase puts failures back in the URL fragment rather than throwing.
    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    if (fragment.get("error") || fragment.get("error_description")) {
      console.error("recovery link rejected", fragment.get("error_description"));
      settle("invalid");
      return;
    }

    // Our own listener, alongside the one in AuthProvider. The client emits
    // PASSWORD_RECOVERY once it has read the token out of the fragment.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) settle("ready");
    });

    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) settle("ready");
    }).catch(() => settle("invalid"));

    const timer = window.setTimeout(() => settle("invalid"), TOKEN_GRACE_MS);

    return () => {
      done = true;
      window.clearTimeout(timer);
      sub.subscription.unsubscribe();
    };
  }, []);

  const canSubmit = passwordMeetsRule(password) && password === confirm;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || busy) return;
    setBusy(true);
    setError(null);

    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) setError(describeAuthError(error));
      else navigate("/journal", { replace: true });
    } catch {
      setError("We couldn't connect. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5 py-16">
      <div className="w-full max-w-sm animate-rise">
        <Lock className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
        <h1 className="mt-6 font-display text-3xl leading-tight">Set a new password</h1>

        {status === "checking" && (
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">Checking your link.</p>
        )}

        {status === "invalid" && (
          <>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              This link has expired or has already been used. You can ask for a new one.
            </p>
            <Button
              onClick={() => navigate("/auth")}
              className="mt-8 h-12 w-full rounded-full"
            >
              Request a new link
            </Button>
          </>
        )}

        {status === "ready" && (
          <>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Choose something you'll remember. You'll be signed in here after saving. In the mobile app, return to Unravel and sign in with your new password.
            </p>

            <form onSubmit={submit} className="mt-8 space-y-4">
              <PasswordField
                id="new-password"
                label="New password"
                value={password}
                onChange={setPassword}
                autoComplete="new-password"
                required
              />

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
                  id="confirm-password"
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

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button
                type="submit"
                disabled={!canSubmit || busy}
                className="h-12 w-full rounded-full"
              >
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save new password
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};

export default ResetPassword;
