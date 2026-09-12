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
// Four digits are also protected by an in-app attempt delay. A much larger
// value made the JavaScript implementation visibly stall on phones.
const PASSCODE_ITERATIONS = 2_000;
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

/** Older PBKDF2 rows still verify once, then get replaced with the faster format. */
export function needsPasscodeUpgrade(stored: string): boolean {
  if (isLegacyPasscode(stored)) return true;
  const [scheme, rawIterations] = stored.split('$');
  return scheme === PASSCODE_SCHEME && Number(rawIterations) !== PASSCODE_ITERATIONS;
}

/** Hash a code for storage, with a fresh random salt. */
export async function hashPasscode(code: string): Promise<string> {
  const salt = Crypto.getRandomBytes(PASSCODE_SALT_BYTES);
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
  if (extra !== undefined || !Number.isInteger(iterations) || iterations <= 0 || iterations > 1_000_000) return false;
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
