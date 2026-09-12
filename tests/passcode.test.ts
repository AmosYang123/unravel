import { webcrypto } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("../mobile/node_modules/expo-crypto", () => ({ getRandomBytes: (size: number) => webcrypto.getRandomValues(new Uint8Array(size)), randomUUID: () => webcrypto.randomUUID() }));
import * as web from "../src/lib/store";
import * as mobile from "../mobile/lib/passcode";
beforeAll(() => vi.stubGlobal("crypto", webcrypto));
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
  });
}

it("marks older mobile hashes for a one-time speed upgrade", () => {
  expect(mobile.needsPasscodeUpgrade("pbkdf2$210000$00000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000")).toBe(true);
  expect(mobile.needsPasscodeUpgrade("pbkdf2$20000$00000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000")).toBe(true);
  expect(mobile.needsPasscodeUpgrade("pbkdf2$2000$00000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000")).toBe(false);
});
it("uses compatible hashes on web and mobile, including leading zeroes", async () => {
  const webHash = await web.hashPasscode("0123");
  expect(await mobile.verifyPasscode("0123", webHash)).toBe(true);
  expect(await mobile.verifyPasscode("9999", webHash)).toBe(false);
  const mobileHash = await mobile.hashPasscode("0123");
  expect(await web.verifyPasscode("0123", mobileHash)).toBe(true);
  expect(mobileHash).not.toBe(webHash);
});
