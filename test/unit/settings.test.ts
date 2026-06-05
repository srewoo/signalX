import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { installChromeMock } from '../helpers/chromeMock';
import { DEFAULT_PREFS } from '../../src/shared/contracts';
import type { Preferences, ProviderSettings } from '../../src/shared/contracts';

beforeEach(() => {
  vi.resetModules();
  installChromeMock();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function load() {
  return import('../../src/background/storage/settings');
}

describe('getPrefs / setPrefs', () => {
  it('should return DEFAULT_PREFS when no prefs are stored', async () => {
    const { getPrefs } = await load();
    expect(await getPrefs()).toEqual(DEFAULT_PREFS);
  });

  it('should round-trip valid preferences through set then get', async () => {
    const { getPrefs, setPrefs } = await load();
    const prefs: Preferences = { country: 'US', defaultSummaryType: 'detailed', theme: 'dark' };
    await setPrefs(prefs);
    expect(await getPrefs()).toEqual(prefs);
  });

  it('should fall back to DEFAULT_PREFS when stored prefs are corrupt', async () => {
    const fake = installChromeMock();
    vi.resetModules();
    vi.stubGlobal('chrome', fake);
    fake.storage.local.store.set('__signalx_prefs_v1', { country: 'MARS', theme: 'neon' });
    const { getPrefs } = await load();
    expect(await getPrefs()).toEqual(DEFAULT_PREFS);
  });

  it('should throw when setting prefs that fail validation', async () => {
    const { setPrefs } = await load();
    const bad = { country: 'XX', defaultSummaryType: 'short', theme: 'auto' } as unknown as Preferences;
    await expect(setPrefs(bad)).rejects.toBeDefined();
  });
});

describe('getProvider / setProvider', () => {
  it('should return null when no provider is stored', async () => {
    const { getProvider } = await load();
    expect(await getProvider()).toBeNull();
  });

  it('should round-trip provider settings with an encrypted key through set then get', async () => {
    const { getProvider, setProvider } = await load();
    const settings: ProviderSettings = { provider: 'openai', apiKey: 'sk-secret-key', model: 'gpt-4o-mini' };
    await setProvider(settings);
    const got = await getProvider();
    expect(got).toEqual(settings);
  });

  it('should never store the api key in plaintext', async () => {
    const fake = installChromeMock();
    vi.resetModules();
    vi.stubGlobal('chrome', fake);
    const { setProvider } = await load();
    await setProvider({ provider: 'anthropic', apiKey: 'sk-plaintext-leak-check', model: 'm' });
    const stored = JSON.stringify(fake.storage.local.store.get('__signalx_provider_v1'));
    expect(stored).not.toContain('sk-plaintext-leak-check');
  });

  it('should clear and return null when stored provider settings are corrupt', async () => {
    const fake = installChromeMock();
    vi.resetModules();
    vi.stubGlobal('chrome', fake);
    fake.storage.local.store.set('__signalx_provider_v1', { provider: 'nope' });
    const { getProvider } = await load();
    expect(await getProvider()).toBeNull();
    expect(fake.storage.local.store.has('__signalx_provider_v1')).toBe(false);
  });
});

describe('getProviderPublic', () => {
  it('should return provider + model + hasKey WITHOUT the api key', async () => {
    const { setProvider, getProviderPublic } = await load();
    await setProvider({ provider: 'openai', apiKey: 'sk-secret', model: 'gpt-4o-mini' });
    const pub = await getProviderPublic();
    expect(pub).toEqual({ provider: 'openai', model: 'gpt-4o-mini', hasKey: true });
    expect(JSON.stringify(pub)).not.toContain('sk-secret');
  });

  it('should return null when nothing is stored', async () => {
    const { getProviderPublic } = await load();
    expect(await getProviderPublic()).toBeNull();
  });
});

describe('setProvider key preservation (masked UI)', () => {
  it('should keep the stored key when apiKey is empty and provider is unchanged', async () => {
    const { setProvider, getProvider } = await load();
    await setProvider({ provider: 'openai', apiKey: 'sk-keep', model: 'gpt-4o-mini' });
    // Model-only update from the masked UI (no key sent).
    await setProvider({ provider: 'openai', apiKey: '', model: 'gpt-4o' });
    const got = await getProvider();
    expect(got).toEqual({ provider: 'openai', apiKey: 'sk-keep', model: 'gpt-4o' });
  });

  it('should be a no-op when apiKey is empty and no key is stored for that provider', async () => {
    const { setProvider, getProvider } = await load();
    await setProvider({ provider: 'openai', apiKey: 'sk-openai', model: 'm' });
    // Different provider, empty key — nothing to preserve, must not persist.
    await setProvider({ provider: 'anthropic', apiKey: '', model: 'claude' });
    const got = await getProvider();
    expect(got?.provider).toBe('openai'); // unchanged
  });
});
