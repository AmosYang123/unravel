import { expect, it } from "vitest";
import { MINIMUM_AGE, ageOn, checkMinimumAge, parseBirthDate } from "../src/lib/age";

it("counts age by calendar date, not elapsed time", () => {
  expect(ageOn(new Date(2010, 0, 15), new Date(2026, 0, 15))).toBe(16);
  // The day before the birthday is still the previous age.
  expect(ageOn(new Date(2010, 0, 15), new Date(2026, 0, 14))).toBe(15);
  // A February 29th birthday does not drift in a non-leap year.
  expect(ageOn(new Date(2008, 1, 29), new Date(2026, 1, 28))).toBe(17);
  expect(ageOn(new Date(2008, 1, 29), new Date(2026, 2, 1))).toBe(18);
});

it("reads a date input value and rejects anything that is not a real date", () => {
  expect(parseBirthDate("2010-01-15")).toEqual(new Date(2010, 0, 15));
  expect(parseBirthDate("  2010-01-15  ")).toEqual(new Date(2010, 0, 15));
  expect(parseBirthDate("")).toBeNull();
  // Would otherwise roll forward into March rather than being refused.
  expect(parseBirthDate("2026-02-30")).toBeNull();
  expect(parseBirthDate("2026-13-01")).toBeNull();
  expect(parseBirthDate("15/01/2010")).toBeNull();
  expect(parseBirthDate("2010-1-5")).toBeNull();
});

it("admits someone exactly on their thirteenth birthday and refuses the day before", () => {
  const today = new Date(2026, 8, 19);
  expect(checkMinimumAge("2013-09-19", today)).toBe("ok");
  expect(checkMinimumAge("2013-09-20", today)).toBe("too-young");
  expect(MINIMUM_AGE).toBe(13);
});

it("treats an empty, unparseable, future or implausible date as unanswered", () => {
  const today = new Date(2026, 8, 19);
  expect(checkMinimumAge("", today)).toBe("unknown");
  expect(checkMinimumAge("not a date", today)).toBe("unknown");
  expect(checkMinimumAge("2030-01-01", today)).toBe("unknown");
  expect(checkMinimumAge("1850-01-01", today)).toBe("unknown");
});
