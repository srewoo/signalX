import type { Preferences, ProviderPublic, ProviderSettings } from '../../shared/contracts';
import { DEFAULT_PREFS } from '../../shared/contracts';
import { log } from '../logger';
import { local, readRaw, removeKey, withSerializedWrite, writeRaw } from './area';
import { decryptString, encryptString } from './crypto';
import { preferencesSchema, storedProviderSchema } from './schemas';

const PROVIDER_KEY = '__signalx_provider_v1';
const PREFS_KEY = '__signalx_prefs_v1';

/** Read decrypted provider settings, or null if unset/corrupt. Never logs the key. */
export async function getProvider(): Promise<ProviderSettings | null> {
  const raw = await readRaw(local(), PROVIDER_KEY);
  if (raw === undefined) return null;
  const parsed = storedProviderSchema.safeParse(raw);
  if (!parsed.success) {
    log.warn('provider settings corrupt; clearing');
    await removeKey(local(), PROVIDER_KEY);
    return null;
  }
  try {
    const apiKey = await decryptString(parsed.data.apiKey);
    return { provider: parsed.data.provider, apiKey, model: parsed.data.model };
  } catch {
    log.warn('provider key decrypt failed; clearing');
    await removeKey(local(), PROVIDER_KEY);
    return null;
  }
}

/**
 * Provider config WITHOUT the key, for the UI. Presence is detected without
 * decrypting. Returns null if unset or corrupt.
 */
export async function getProviderPublic(): Promise<ProviderPublic | null> {
  const raw = await readRaw(local(), PROVIDER_KEY);
  if (raw === undefined) return null;
  const parsed = storedProviderSchema.safeParse(raw);
  if (!parsed.success) return null;
  return { provider: parsed.data.provider, model: parsed.data.model, hasKey: true };
}

/**
 * Encrypt and persist provider settings. An empty `apiKey` means "keep the
 * existing stored key" (model/provider-only update from the masked UI) — only
 * valid when a key is already stored for the SAME provider; otherwise the write
 * is a no-op (you can't configure a provider with no key). Serialized so a
 * model-change write can't race a key-change write and lose one.
 */
export async function setProvider(settings: ProviderSettings): Promise<void> {
  await withSerializedWrite(PROVIDER_KEY, async () => {
    let plain = settings.apiKey;
    if (!plain) {
      const existing = await getProvider();
      if (!existing || existing.provider !== settings.provider) return; // nothing to preserve
      plain = existing.apiKey;
    }
    const apiKey = await encryptString(plain);
    await writeRaw(local(), PROVIDER_KEY, {
      provider: settings.provider,
      apiKey,
      model: settings.model,
    });
  });
}

/** Read preferences, falling back to DEFAULT_PREFS on missing/corrupt data. */
export async function getPrefs(): Promise<Preferences> {
  const raw = await readRaw(local(), PREFS_KEY);
  if (raw === undefined) return DEFAULT_PREFS;
  const parsed = preferencesSchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_PREFS;
}

export async function setPrefs(prefs: Preferences): Promise<void> {
  const parsed = preferencesSchema.parse(prefs);
  await writeRaw(local(), PREFS_KEY, parsed);
}
