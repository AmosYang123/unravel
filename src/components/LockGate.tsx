import { useEffect, useRef, useState } from "react";
import { Lock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { hashPasscode, isLegacyPasscode, useSettings, verifyPasscode } from "@/lib/store";

/** Wrong attempts allowed before the next try has to wait. */
const FREE_ATTEMPTS = 2;
const BASE_DELAY_MS = 5000;
const MAX_DELAY_MS = 30000;

const delayFor = (wrongAttempts: number) => {
  if (wrongAttempts <= FREE_ATTEMPTS) return 0;
  return Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** (wrongAttempts - FREE_ATTEMPTS - 1));
};

const LockGate = ({ children }: { children: React.ReactNode }) => {
  const { settings, update } = useSettings();
  const [unlocked, setUnlocked] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState("");
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState(false);
  const [wrong, setWrong] = useState(false);
  const [waitSeconds, setWaitSeconds] = useState(0);
  const blockedUntil = useRef(0);
  const attempts = useRef(0);
  // Held in a ref so a new `update` identity can never re-trigger the check.
  const updateRef = useRef(update);
  updateRef.current = update;

  const locked = settings.lockEnabled && settings.passcode.length > 0 && !unlocked;

  useEffect(() => {
    if (!locked || code.length !== 4) return;
    if (Date.now() < blockedUntil.current) return;
    let cancelled = false;

    void (async () => {
      const stored = settings.passcode;
      setChecking(true);
      setCheckError(false);
      let ok: boolean;
      try {
        ok = await verifyPasscode(code, stored);
      } catch {
        if (!cancelled) {
          setCheckError(true);
          setCode("");
          setChecking(false);
        }
        return;
      }
      if (cancelled) return;
      setChecking(false);
      if (ok) {
        setUnlocked(true);
        setCode("");
        setWrong(false);
        attempts.current = 0;
        // Quietly move a pre-hashing row onto a hash now that we know the code.
        if (isLegacyPasscode(stored)) {
          try {
            await updateRef.current({ passcode: await hashPasscode(code) });
          } catch (err) {
            console.error("Passcode upgrade failed", err);
          }
        }
        return;
      }
      attempts.current += 1;
      setWrong(true);
      setCode("");
      const delay = delayFor(attempts.current);
      if (delay > 0) {
        blockedUntil.current = Date.now() + delay;
        setWaitSeconds(Math.ceil(delay / 1000));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code, settings.passcode, locked]);

  // Count the wait down so the field re-enables on its own.
  useEffect(() => {
    if (waitSeconds <= 0) return;
    const id = setInterval(() => {
      const left = Math.ceil((blockedUntil.current - Date.now()) / 1000);
      setWaitSeconds(left > 0 ? left : 0);
    }, 250);
    return () => clearInterval(id);
  }, [waitSeconds]);

  useEffect(() => {
    if (locked && !checking && waitSeconds === 0) inputRef.current?.focus();
  }, [locked, checking, waitSeconds]);

  if (!locked) return <>{children}</>;

  const waiting = waitSeconds > 0;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6">
      <Lock className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
      <h1 className="mt-6 font-display text-2xl">Enter your code</h1>
      <Input
        ref={inputRef}
        autoFocus
        type="password"
        value={code}
        inputMode="numeric"
        maxLength={4}
        disabled={waiting || checking}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
        className="mt-8 h-14 w-40 rounded-2xl bg-card text-center text-2xl tracking-[0.5em]"
        aria-label="Passcode"
      />
      {checkError && <p role="alert" className="mt-4 text-sm text-destructive">Couldn't check your code. Please try again.</p>}
      {waiting ? (
        <p className="mt-4 text-sm text-muted-foreground" role="status">
          Too many tries. Wait {waitSeconds}s.
        </p>
      ) : (
        wrong && <p className="mt-4 text-sm text-destructive">Not quite. Try again.</p>
      )}
    </div>
  );
};

export default LockGate;
