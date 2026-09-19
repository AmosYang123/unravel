import { pbkdf2Sync, webcrypto } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("../mobile/node_modules/expo-crypto", () => ({ getRandomValues: (array: Uint8Array) => webcrypto.getRandomValues(array), randomUUID: () => webcrypto.randomUUID() }));
import * as web from "../src/lib/store";
import * as mobile from "../mobile/lib/passcode";
beforeAll(() => vi.stubGlobal("crypto", webcrypto));
/** The iteration count both clients must write. Mirrors PASSCODE_ITERATIONS. */
const CURRENT_ITERATIONS = 210_000;
/** A stored row at an arbitrary strength, built without the app's own hashing. */
const rowAt = (code: string, iterations: number, saltHex = "a1".repeat(16)) =>
  `pbkdf2$${iterations}$${saltHex}$${pbkdf2Sync(code, Buffer.from(saltHex, "hex"), iterations, 32, "sha256").toString("hex")}`;
for (const [name, passcode] of [["web", web], ["mobile", mobile]] as const) {
  describe(`${name} passcodes`, () => {
    it("accepts legacy codes and rejects incorrect codes", async () => {
      expect(await passcode.verifyPasscode("0123", "0123")).toBe(true);
      expect(await passcode.verifyPasscode("1234", "0123")).toBe(false);
    });
    it("rejects malformed hashes without running an expensive derivation", async () => {
      for (const stored of ["pbkdf2$Infinity$aa$bb", "pbkdf2$9999999999$aa$bb", "pbkdf2$1.5$aa$bb", "pbkdf2$210000$zz$bb", "pbkdf2$210000$aa$bb$extra"]) {
        expect(await passcode.verifyPasscode("0123", stored)).toBe(false);
      }
    });
    it("refuses an absurd stored iteration count instead of deriving", async () => {
      const absurd = `pbkdf2$999000000$${"a1".repeat(16)}$${"b2".repeat(32)}`;
      const started = performance.now();
      expect(await passcode.verifyPasscode("0123", absurd)).toBe(false);
      expect(performance.now() - started).toBeLessThan(100);
    });
    it("still unlocks a weak 2,000 iteration row, and marks it for upgrade", async () => {
      const weak = rowAt("0123", 2_000);
      expect(await passcode.verifyPasscode("0123", weak)).toBe(true);
      expect(await passcode.verifyPasscode("9999", weak)).toBe(false);
      expect(passcode.needsPasscodeUpgrade(weak)).toBe(true);
    });
    it("leaves a row at or above the current strength alone", async () => {
      const current = rowAt("0123", CURRENT_ITERATIONS);
      expect(await passcode.verifyPasscode("0123", current)).toBe(true);
      expect(passcode.needsPasscodeUpgrade(current)).toBe(false);
      expect(passcode.needsPasscodeUpgrade(rowAt("0123", 600_000))).toBe(false);
    });
    it("rewrites a legacy plaintext row at full strength", async () => {
      expect(passcode.needsPasscodeUpgrade("0123")).toBe(true);
      const rewritten = await passcode.hashPasscode("0123");
      expect(rewritten.split("$")[1]).toBe(String(CURRENT_ITERATIONS));
      expect(passcode.needsPasscodeUpgrade(rewritten)).toBe(false);
      expect(await passcode.verifyPasscode("0123", rewritten)).toBe(true);
    });
  });
}

it("upgrades weaker mobile hashes without ever downgrading stronger ones", () => {
  const at = (iterations: number) => `pbkdf2$${iterations}$00000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000`;
  expect(mobile.needsPasscodeUpgrade(at(2_000))).toBe(true);
  expect(mobile.needsPasscodeUpgrade(at(20_000))).toBe(true);
  expect(mobile.needsPasscodeUpgrade(at(210_000))).toBe(false);
  expect(mobile.needsPasscodeUpgrade(at(600_000))).toBe(false);
});
it("uses compatible hashes on web and mobile, including leading zeroes", async () => {
  const webHash = await web.hashPasscode("0123");
  expect(await mobile.verifyPasscode("0123", webHash)).toBe(true);
  expect(await mobile.verifyPasscode("9999", webHash)).toBe(false);
  const mobileHash = await mobile.hashPasscode("0123");
  expect(await web.verifyPasscode("0123", mobileHash)).toBe(true);
  expect(mobileHash).not.toBe(webHash);
  // Neither client may write the row at a weaker strength than the other.
  expect(mobileHash.split("$")[1]).toBe(webHash.split("$")[1]);
  expect(Number(mobileHash.split("$")[1])).toBeGreaterThanOrEqual(CURRENT_ITERATIONS);
});
