import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { MIN_PASSWORD_LENGTH, describeAuthError, passwordMeetsRule } from "@/lib/password";
import { importLegacyLocalData, legacyLocalEntryCount } from "@/lib/store";
import Row from "./Row";
import SettingRow from "./SettingRow";

const AccountSection = () => {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [legacyCount, setLegacyCount] = useState(() => legacyLocalEntryCount());
  const [importing, setImporting] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminCheckFailed, setAdminCheckFailed] = useState(false);
  const [upgradeEmail, setUpgradeEmail] = useState("");
  const [upgradePassword, setUpgradePassword] = useState("");
  const [upgrading, setUpgrading] = useState(false);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);
  const [upgradeNotice, setUpgradeNotice] = useState<string | null>(null);

  // Supabase marks anonymous sessions with is_anonymous on the user object.
  const isGuest = user?.is_anonymous === true;
  const canUpgrade =
    upgradeEmail.trim().length > 3 && passwordMeetsRule(upgradePassword) && !upgrading;

  const upgradeAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canUpgrade) return;
    setUpgrading(true);
    setUpgradeError(null);
    setUpgradeNotice(null);
    const { data, error } = await supabase.auth.updateUser({
      email: upgradeEmail.trim(),
      password: upgradePassword,
    });
    if (error) {
      setUpgradeError(describeAuthError(error));
    } else if (data.user?.email) {
      setUpgradeNotice("That's done. Your journal is now on this address.");
      setUpgradePassword("");
    } else {
      // Supabase keeps the address pending until the confirmation link is used.
      setUpgradeNotice(
        `We've sent a confirmation link to ${upgradeEmail.trim()}. Open it to finish attaching the address — until then this stays a guest journal.`,
      );
      setUpgradePassword("");
    }
    setUpgrading(false);
  };

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("Could not check admin role", error);
          setIsAdmin(false);
          setAdminCheckFailed(true);
          return;
        }
        setAdminCheckFailed(false);
        setIsAdmin(!!data);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  return (
    <>
      <SettingRow title="Account" value={user?.email ?? "Guest"} onClick={() => setOpen(true)} />

      <Dialog open={open} onClose={() => setOpen(false)} title="Account">
        <div className="-mt-3 divide-y">
          <Row
            title="Signed in as"
            description={
              isGuest
                ? "This journal lives on this device. Add an email below and it becomes an account you can get back into."
                : "Entries, recordings and these preferences are saved to this account only."
            }
          >
            <span className="text-sm text-muted-foreground">{user?.email ?? "Guest"}</span>
          </Row>

          {isGuest && (
            <div className="py-5">
              <p className="text-base">Keep this journal</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Adding an email and password turns this guest journal into an account. Nothing moves
                or is copied — every entry, recording and preference stays exactly where it is, on the
                same account.
              </p>
              <form onSubmit={upgradeAccount} className="mt-4 space-y-3">
                <div>
                  <label htmlFor="upgrade-email" className="text-sm text-muted-foreground">
                    Email
                  </label>
                  <Input
                    id="upgrade-email"
                    type="email"
                    autoComplete="email"
                    value={upgradeEmail}
                    onChange={(e) => setUpgradeEmail(e.target.value)}
                    className="mt-2 h-12 rounded-xl bg-card"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="upgrade-password" className="text-sm text-muted-foreground">
                    Password
                  </label>
                  <Input
                    id="upgrade-password"
                    type="password"
                    autoComplete="new-password"
                    value={upgradePassword}
                    onChange={(e) => setUpgradePassword(e.target.value)}
                    className="mt-2 h-12 rounded-xl bg-card"
                    required
                  />
                  <p className="mt-2 text-xs text-muted-foreground">
                    At least {MIN_PASSWORD_LENGTH} characters
                  </p>
                </div>
                {upgradeError && <p className="text-sm text-destructive">{upgradeError}</p>}
                {upgradeNotice && <p className="text-sm text-muted-foreground">{upgradeNotice}</p>}
                <Button type="submit" disabled={!canUpgrade} className="h-12 rounded-full">
                  {upgrading ? "Saving…" : "Add email and password"}
                </Button>
              </form>
            </div>
          )}
          {legacyCount > 0 && (
            <Row
              title="Entries saved in this browser"
              description={`${legacyCount} older ${legacyCount === 1 ? "entry" : "entries"} from before you had an account. Move them into it?`}
            >
              <Button
                variant="secondary"
                className="rounded-full"
                disabled={importing}
                onClick={async () => {
                  setImporting(true);
                  try {
                    const n = await importLegacyLocalData();
                    setLegacyCount(0);
                    toast(`Moved ${n} ${n === 1 ? "entry" : "entries"} into your account.`);
                  } catch (err) {
                    console.error("Legacy import failed", err);
                    toast("That import didn't finish. Try again.");
                  } finally {
                    setImporting(false);
                  }
                }}
              >
                {importing ? "Moving…" : "Move them"}
              </Button>
            </Row>
          )}
          {adminCheckFailed && (
            <Row
              title="Impact metrics"
              description="We couldn't check your account permissions just now. Reload to try again."
            >
              <span className="text-sm text-muted-foreground">Unavailable</span>
            </Row>
          )}
          {isAdmin && (
            <Row title="Impact metrics" description="Aggregate mood and energy across all accounts. No entry text, ever.">
              <Button asChild variant="ghost" className="rounded-full">
                <Link to="/impact">Open</Link>
              </Button>
            </Row>
          )}
          <Row
            title="Sign out"
            description={
              isGuest
                ? "A guest journal has no email to sign back in with, so signing out leaves it behind for good."
                : "You'll need your email and password to get back in."
            }
          >
            <Button variant="ghost" className="rounded-full" onClick={() => void signOut()}>
              Sign out
            </Button>
          </Row>
        </div>
      </Dialog>
    </>
  );
};

export default AccountSection;
