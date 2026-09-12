// Password rule: eight characters, nothing else.
//
// This has to sit at or above the project's own minimum (GoTrue's default is
// six). Below it the form accepts a password the server then refuses, and
// describeAuthError answers that refusal by quoting this number back — telling
// someone to use at least four characters when four is exactly what was just
// rejected.
export const MIN_PASSWORD_LENGTH = 8;
export const passwordMeetsRule = (v: string) => v.length >= MIN_PASSWORD_LENGTH;

// Supabase error strings are not for end users. Map the ones we expect and keep
// the detail in the console.
export const describeAuthError = (err: unknown): string => {
  console.error("auth error", err);
  const raw =
    typeof err === "object" && err !== null && "message" in err && typeof err.message === "string"
      ? err.message.toLowerCase()
      : "";

  if (raw.includes("invalid login")) return "That email and password don't match an account.";
  if (raw.includes("already registered") || raw.includes("already been registered"))
    return "There's already an account for that address. Try signing in instead.";
  if (raw.includes("rate limit") || raw.includes("too many requests") || raw.includes("for security purposes"))
    return "Too many attempts just now. Wait a minute and try again.";
  if (raw.includes("password") && (raw.includes("short") || raw.includes("least") || raw.includes("weak")))
    return `That password is too short for this account. Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (raw.includes("expired") || raw.includes("invalid token") || raw.includes("otp"))
    return "That link has expired. Ask for a new one.";
  if (raw.includes("email not confirmed"))
    return "Confirm your email first, then come back and sign in.";
  return "Something went wrong. Try again in a moment.";
};
