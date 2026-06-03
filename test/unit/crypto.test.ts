import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { installChromeMock } from '../helpers/chromeMock';

/**
 * crypto.ts caches the CryptoKey at module scope, so each test gets a fresh
 * module instance via resetModules + dynamic import to stay independent.
 */

beforeEach(() => {
  vi.resetModules();
  installChromeMock();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function loadCrypto() {
  return import('../../src/background/storage/crypto');
}

describe('encryptString / decryptString', () => {
  it('should round-trip plaintext through encrypt then decrypt', async () => {
    const { encryptString, decryptString } = await loadCrypto();
    const plain = 'sk-test-1234567890';
    const enc = await encryptString(plain);
    expect(await decryptString(enc)).toBe(plain);
  });

  it('should round-trip unicode plaintext', async () => {
    const { encryptString, decryptString } = await loadCrypto();
    const plain = '東京 café 🚀 key';
    expect(await decryptString(await encryptString(plain))).toBe(plain);
  });

  it('should round-trip an empty string', async () => {
    const { encryptString, decryptString } = await loadCrypto();
    expect(await decryptString(await encryptString(''))).toBe('');
  });

  it('should produce a base64 iv and data payload', async () => {
    const { encryptString } = await loadCrypto();
    const enc = await encryptString('hello');
    expect(enc.iv.length).toBeGreaterThan(0);
    expect(enc.data.length).toBeGreaterThan(0);
    expect(() => atob(enc.iv)).not.toThrow();
    expect(() => atob(enc.data)).not.toThrow();
  });

  it('should use a distinct IV for each encryption of the same plaintext', async () => {
    const { encryptString } = await loadCrypto();
    const a = await encryptString('same');
    const b = await encryptString('same');
    expect(a.iv).not.toBe(b.iv);
    expect(a.data).not.toBe(b.data);
  });

  it('should persist the per-install secret to chrome.storage.local on first use', async () => {
    const fake = installChromeMock();
    vi.resetModules();
    // re-install so the freshly imported module sees this fake
    vi.stubGlobal('chrome', fake);
    const { encryptString } = await loadCrypto();
    await encryptString('x');
    expect(fake.storage.local.store.has('__signalx_enc_secret_v1')).toBe(true);
  });

  it('should fail to decrypt when the secret key differs (wrong-key) and not silently return wrong text', async () => {
    const { encryptString } = await loadCrypto();
    const enc = await encryptString('secret-value');

    // Simulate a different install: fresh module + fresh storage (new random secret).
    vi.resetModules();
    installChromeMock();
    const fresh = await loadCrypto();
    await expect(fresh.decryptString(enc)).rejects.toBeDefined();
  });

  it('should fail to decrypt when the ciphertext is tampered', async () => {
    const { encryptString, decryptString } = await loadCrypto();
    const enc = await encryptString('integrity-check');
    const tampered = { iv: enc.iv, data: btoa('garbage-data-not-valid') };
    await expect(decryptString(tampered)).rejects.toBeDefined();
  });
});
