import { local, readRaw, writeRaw } from './area';

/**
 * AES-GCM encryption for the BYOK API key. The symmetric key is generated once
 * per install (random 256-bit) and persisted to chrome.storage.local. It never
 * leaves the device and is never synced. The plaintext key is never logged.
 *
 * THREAT MODEL (be honest about what this does and does not protect):
 * The AES-GCM key lives in chrome.storage.local right beside the ciphertext.
 * Anyone (or any code) that can read storage.local can read both and decrypt
 * trivially. So this encryption protects against:
 *   - accidental sync leakage (key is never written to storage.sync), and
 *   - casual/at-rest dumps where the key isn't co-read with the ciphertext.
 * It does NOT protect against a local attacker, malicious extension with
 * storage access, or anyone who can read storage.local — there is no secret
 * outside the device to derive a key from in an extension. It is obfuscation +
 * sync-leak prevention, not real key-management security.
 */

const SECRET_KEY = '__signalx_enc_secret_v1';
const IV_BYTES = 12;

let cachedKey: CryptoKey | null = null;

function toB64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const buffer = new ArrayBuffer(bin.length);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function getKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  const existing = await readRaw(local(), SECRET_KEY);
  let rawKey: Uint8Array<ArrayBuffer>;
  if (typeof existing === 'string' && existing.length > 0) {
    rawKey = fromB64(existing);
  } else {
    rawKey = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(32)));
    await writeRaw(local(), SECRET_KEY, toB64(rawKey));
  }
  cachedKey = await crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ]);
  return cachedKey;
}

export interface Encrypted {
  readonly iv: string;
  readonly data: string;
}

export async function encryptString(plaintext: string): Promise<Encrypted> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(IV_BYTES)));
  const enc = new TextEncoder().encode(plaintext);
  const buf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc);
  return { iv: toB64(iv), data: toB64(new Uint8Array(buf)) };
}

export async function decryptString(payload: Encrypted): Promise<string> {
  const key = await getKey();
  const iv = fromB64(payload.iv);
  const data = fromB64(payload.data);
  const buf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return new TextDecoder().decode(buf);
}
