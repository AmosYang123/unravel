import AsyncStorage from '@react-native-async-storage/async-storage';
import { sha256 } from '@noble/hashes/sha2.js';
import * as Crypto from 'expo-crypto';

/**
 * PBKDF2 at 210,000 rounds runs in plain JS here and takes seconds on a phone.
 * Once this device has seen the right code, it keeps a one-round SHA-256 of it
 * under a device-local salt, tied to the exact stored row, so later unlocks
 * are instant. A 4-digit code is only 10,000 guesses either way, so the slow
 * hash never protected it from someone with the files; the attempt delay in
 * LockGate is what does, and every check still passes through it.
 */
const SHORTCUT_KEY = 'quiet.passcodeShortcut.v1';

interface Shortcut {
  stored: string;
  salt: string;
  digest: string;
}

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

const digestOf = (code: string, salt: string) => toHex(sha256(new TextEncoder().encode(`${salt}:${code}`)));

/** Remember a code already proven right against `stored`. */
export async function rememberPasscode(code: string, stored: string): Promise<void> {
  const salt = toHex(Crypto.getRandomValues(new Uint8Array(16)));
  const shortcut: Shortcut = { stored, salt, digest: digestOf(code, salt) };
  await AsyncStorage.setItem(SHORTCUT_KEY, JSON.stringify(shortcut)).catch(() => {});
}

/**
 * True or false when this device can answer instantly; null when it can't
 * (nothing remembered, or the stored code has changed since) and the caller
 * has to run the full check.
 */
export async function checkRememberedPasscode(code: string, stored: string): Promise<boolean | null> {
  let shortcut: Partial<Shortcut> | null = null;
  try {
    const raw = await AsyncStorage.getItem(SHORTCUT_KEY);
    shortcut = raw ? (JSON.parse(raw) as Partial<Shortcut>) : null;
  } catch {
    return null;
  }
  if (!stored || shortcut?.stored !== stored || typeof shortcut.salt !== 'string' || typeof shortcut.digest !== 'string') {
    return null;
  }
  const candidate = digestOf(code, shortcut.salt);
  if (candidate.length !== shortcut.digest.length) return false;
  let diff = 0;
  for (let i = 0; i < candidate.length; i += 1) diff |= candidate.charCodeAt(i) ^ shortcut.digest.charCodeAt(i);
  return diff === 0;
}
