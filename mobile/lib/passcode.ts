import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import * as Crypto from 'expo-crypto';

/**
 * The lock code is stored as a PBKDF2-SHA256 hash with a per-user random salt,
 * so `profiles.passcode` never holds the digits themselves.
 * Format: `pbkdf2$<iterations>$<saltHex>$<hashHex>`.
 *
 * React Native has no `crypto.subtle`, so the derivation runs through
 * @noble/hashes instead of Web Crypto. The output is byte-for-byte identical
 * to the web app's, so one account's passcode works on both platforms.
 */
const PASSCODE_SCHEME = 'pbkdf2';
// Must stay equal to PASSCODE_ITERATIONS in src/lib/store.ts: both trees write
// the same `profiles.passcode` row and there is no shared module between them.
// Only ever raise this — a lower value here would weaken every row the web app
// wrote. Four digits are also protected by an in-app attempt delay.
const PASSCODE_ITERATIONS = 210_000;
// The most a *stored* row may ask us to run, so a corrupt or hostile row cannot
// stall the lock screen inside pbkdf2Async. Leaves room for one future raise of
// PASSCODE_ITERATIONS; anything above this fails closed instead of deriving.
const PASSCODE_MAX_ITERATIONS = 600_000;
const PASSCODE_SALT_BYTES = 16;
const PASSCODE_HASH_BYTES = 32; // 256 bits

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

const fromHex = (hex: string) => {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
};

async function derive(code: string, salt: Uint8Array, iterations: number): Promise<string> {
  const bits = await pbkdf2Async(sha256, new TextEncoder().encode(code), salt, {
    c: iterations,
    dkLen: PASSCODE_HASH_BYTES,
  });
  return toHex(bits);
}

/** True when the stored value is a pre-hashing 4-digit code that still needs upgrading. */
export function isLegacyPasscode(stored: string): boolean {
  return /^\d{4}$/.test(stored);
}

/**
 * Weaker rows still verify once, then get rewritten at the current strength.
 * Upgrade-only on purpose: a row already at or above PASSCODE_ITERATIONS is left
 * alone, so unlocking here can never lower what the web app stored.
 */
export function needsPasscodeUpgrade(stored: string): boolean {
  if (isLegacyPasscode(stored)) return true;
  const [scheme, rawIterations] = stored.split('$');
  if (scheme !== PASSCODE_SCHEME) return false;
  const iterations = Number(rawIterations);
  return Number.isInteger(iterations) && iterations < PASSCODE_ITERATIONS;
}

/** Hash a code for storage, with a fresh random salt. */
export async function hashPasscode(code: string): Promise<string> {
  // getRandomValues is the documented CSPRNG; getRandomBytes falls back to
  // `Math.random` in development.
  const salt = Crypto.getRandomValues(new Uint8Array(PASSCODE_SALT_BYTES));
  const hash = await derive(code, salt, PASSCODE_ITERATIONS);
  return `${PASSCODE_SCHEME}$${PASSCODE_ITERATIONS}$${toHex(salt)}$${hash}`;
}

/** Check a typed code against a stored value, accepting legacy plaintext rows. */
export async function verifyPasscode(code: string, stored: string): Promise<boolean> {
  if (!/^\d{4}$/.test(code) || !stored) return false;
  if (isLegacyPasscode(stored)) return code === stored;
  const [scheme, rawIterations, saltHex, hashHex, extra] = stored.split('$');
  if (scheme !== PASSCODE_SCHEME || !saltHex || !hashHex) return false;
  const iterations = Number(rawIterations);
  if (extra !== undefined || !Number.isInteger(iterations) || iterations <= 0) return false;
  if (iterations > PASSCODE_MAX_ITERATIONS) return false;
  if (!/^[0-9a-f]{32}$/.test(saltHex) || !/^[0-9a-f]{64}$/.test(hashHex)) return false;
  const candidate = await derive(code, fromHex(saltHex), iterations);
  // Constant-time-ish compare; both strings are the same fixed length here.
  if (candidate.length !== hashHex.length) return false;
  let diff = 0;
  for (let i = 0; i < candidate.length; i += 1) diff |= candidate.charCodeAt(i) ^ hashHex.charCodeAt(i);
  return diff === 0;
}

/** Stable id generator; `crypto.randomUUID` is not available on React Native. */
export const uid = () => Crypto.randomUUID();
