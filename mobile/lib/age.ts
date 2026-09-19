/**
 * The minimum age for an Unravel account.
 *
 * COPPA turns on *knowingly* collecting personal information from a child
 * under 13, and an account here stores exactly that: journal text, moods,
 * feelings and voice recordings. The app is pitched at high school students
 * (see `writerContext` in lib/onboarding.ts), so under-13s are out of the
 * intended audience anyway — this refuses them at the one moment that
 * matters, account creation.
 *
 * The date is checked and thrown away. Nothing persists it: the answer only
 * has to live long enough to allow or refuse the account, and storing a birth
 * date would add a piece of personal data the privacy policy would then have
 * to account for.
 */
export const MINIMUM_AGE = 13;

/**
 * Whole years between two dates, compared as calendar dates rather than
 * elapsed milliseconds, so leap years and daylight saving never move someone
 * across their own birthday.
 */
export function ageOn(birth: Date, on: Date): number {
  const beforeBirthday =
    on.getMonth() < birth.getMonth() ||
    (on.getMonth() === birth.getMonth() && on.getDate() < birth.getDate());
  return on.getFullYear() - birth.getFullYear() - (beforeBirthday ? 1 : 0);
}

/**
 * Reads the `YYYY-MM-DD` value a date input produces. Returns null for
 * anything that is not a real calendar date — the empty string an untouched
 * input gives back, and values like 2026-02-30 that would otherwise roll
 * forward into March.
 */
export function parseBirthDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

/** `unknown` covers both "not filled in yet" and "not a usable date". */
export type AgeCheck = "unknown" | "too-young" | "ok";

export function checkMinimumAge(value: string, today: Date = new Date()): AgeCheck {
  const birth = parseBirthDate(value);
  if (!birth) return "unknown";
  const age = ageOn(birth, today);
  // A future date or an implausible one is a typo, not an answer.
  if (age < 0 || age > 120) return "unknown";
  return age >= MINIMUM_AGE ? "ok" : "too-young";
}
