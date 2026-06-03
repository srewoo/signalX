import { z } from 'zod';
import type { ProviderId, ProviderSettings, Result } from '../../shared/contracts';
import { ok } from '../result';
import { readRaw, session, writeRaw } from '../storage/area';
import { mapHttpError, mapThrownError } from './errors';

/**
 * Per-provider model listing for the settings screen. Each provider's /models
 * endpoint is fetched (8s timeout, zod-validated, filtered to chat-capable
 * ids), and the result is cached in storage.session keyed by provider (NEVER by
 * api key — the key is not stored here). On ANY failure we return ok() with a
 * static fallback list and source:'fallback' so the settings screen never
 * hard-fails on a flaky/offline /models call.
 */

export interface ModelOption {
  readonly id: string;
  readonly label: string;
}

export interface ListModelsResult {
  readonly models: readonly ModelOption[];
  readonly source: 'live' | 'fallback';
}

const MODELS_TIMEOUT_MS = 8_000;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1h
const OPENROUTER_CAP = 30;

// ───────────────────────── Static fallback lists ─────────────────────────
// Minimal, intentionally conservative. The panel keeps its own richer catalog
// as a last resort; these exist so listing never hard-fails from the worker.

export const FALLBACK_MODELS: Readonly<Record<ProviderId, readonly ModelOption[]>> = {
  anthropic: [
    { id: 'claude-haiku-4-5', label: 'claude-haiku-4-5' },
    { id: 'claude-sonnet-4-6', label: 'claude-sonnet-4-6' },
    { id: 'claude-opus-4-8', label: 'claude-opus-4-8' },
  ],
  openai: [
    { id: 'gpt-5-mini', label: 'gpt-5-mini' },
    { id: 'gpt-5.1', label: 'gpt-5.1' },
    { id: 'gpt-5-nano', label: 'gpt-5-nano' },
  ],
  gemini: [
    { id: 'gemini-2.5-flash', label: 'gemini-2.5-flash' },
    { id: 'gemini-2.5-flash-lite', label: 'gemini-2.5-flash-lite' },
    { id: 'gemini-3-pro-preview', label: 'gemini-3-pro-preview' },
  ],
  openrouter: [
    { id: 'anthropic/claude-haiku-4.5', label: 'claude-haiku-4.5' },
    { id: 'openai/gpt-5-mini', label: 'gpt-5-mini' },
    { id: 'google/gemini-2.5-flash', label: 'gemini-2.5-flash' },
  ],
};

function fallback(provider: ProviderId): ListModelsResult {
  return { models: FALLBACK_MODELS[provider], source: 'fallback' };
}

// ───────────────────────── Response schemas ─────────────────────────

const openaiSchema = z.object({
  data: z.array(z.object({ id: z.string(), created: z.number().optional() })),
});

const anthropicSchema = z.object({
  data: z.array(z.object({ id: z.string(), display_name: z.string().optional() })),
});

const geminiSchema = z.object({
  models: z.array(
    z.object({
      name: z.string(),
      displayName: z.string().optional(),
      supportedGenerationMethods: z.array(z.string()).optional(),
    }),
  ),
});

const openrouterSchema = z.object({
  data: z.array(z.object({ id: z.string(), name: z.string().optional() })),
});

// ───────────────────────── Pure parsers / filters ─────────────────────────

/** Non-chat OpenAI model markers to exclude (embeddings, audio, image, etc.). */
const OPENAI_EXCLUDE = /(embedding|audio|tts|whisper|dall-e|realtime|instruct|moderation|image|transcribe)/i;

/** Chat-capable gpt-* ids, newest-ish first (by `created` desc when present). */
export function parseOpenAiModels(json: unknown): ModelOption[] {
  const parsed = openaiSchema.safeParse(json);
  if (!parsed.success) return [];
  return parsed.data.data
    .filter((m) => m.id.startsWith('gpt-') && !OPENAI_EXCLUDE.test(m.id))
    .sort((a, b) => (b.created ?? 0) - (a.created ?? 0))
    .map((m) => ({ id: m.id, label: m.id }));
}

/** Anthropic models; display_name as label when present. */
export function parseAnthropicModels(json: unknown): ModelOption[] {
  const parsed = anthropicSchema.safeParse(json);
  if (!parsed.success) return [];
  return parsed.data.data.map((m) => ({ id: m.id, label: m.display_name ?? m.id }));
}

/** Gemini models supporting generateContent; "models/" prefix stripped from id. */
export function parseGeminiModels(json: unknown): ModelOption[] {
  const parsed = geminiSchema.safeParse(json);
  if (!parsed.success) return [];
  return parsed.data.models
    .filter((m) => (m.supportedGenerationMethods ?? []).includes('generateContent'))
    .map((m) => {
      const id = m.name.replace(/^models\//, '');
      return { id, label: m.displayName ?? id };
    });
}

const OPENROUTER_PREFIXES = ['anthropic/', 'openai/', 'google/', 'meta-llama/'];

/** OpenRouter models from the major vendors, capped to keep the list sane. */
export function parseOpenRouterModels(json: unknown): ModelOption[] {
  const parsed = openrouterSchema.safeParse(json);
  if (!parsed.success) return [];
  return parsed.data.data
    .filter((m) => OPENROUTER_PREFIXES.some((p) => m.id.startsWith(p)))
    .slice(0, OPENROUTER_CAP)
    .map((m) => ({ id: m.id, label: m.name ?? m.id }));
}

// ───────────────────────── Live fetchers ─────────────────────────

interface ProviderFetcher {
  readonly url: string;
  headers(apiKey: string): Record<string, string>;
  parse(json: unknown): ModelOption[];
}

const FETCHERS: Record<ProviderId, ProviderFetcher> = {
  openai: {
    url: 'https://api.openai.com/v1/models',
    headers: (key) => ({ authorization: `Bearer ${key}` }),
    parse: parseOpenAiModels,
  },
  anthropic: {
    url: 'https://api.anthropic.com/v1/models',
    headers: (key) => ({
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    }),
    parse: parseAnthropicModels,
  },
  gemini: {
    url: 'https://generativelanguage.googleapis.com/v1beta/models',
    headers: (key) => ({ 'x-goog-api-key': key }),
    parse: parseGeminiModels,
  },
  openrouter: {
    url: 'https://openrouter.ai/api/v1/models',
    headers: (key) => ({ authorization: `Bearer ${key}` }),
    parse: parseOpenRouterModels,
  },
};

/** Fetch + parse the live list for a provider. Returns null on ANY failure. */
async function fetchLive(settings: ProviderSettings): Promise<ModelOption[] | null> {
  const fetcher = FETCHERS[settings.provider];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MODELS_TIMEOUT_MS);
  try {
    const res = await fetch(fetcher.url, {
      method: 'GET',
      signal: controller.signal,
      headers: fetcher.headers(settings.apiKey),
    });
    if (!res.ok) {
      // Map for parity/logging discipline; listing must not surface this error.
      const body = await res.text().catch(() => '');
      mapHttpError(res.status, body, res.headers.get('retry-after'));
      return null;
    }
    const json: unknown = await res.json();
    const models = fetcher.parse(json);
    return models.length > 0 ? models : null;
  } catch (e) {
    mapThrownError(e); // categorize; swallowed by design (fallback path)
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ───────────────────────── Session cache (keyed by provider) ─────────────────────────

const cacheEntrySchema = z.object({
  models: z.array(z.object({ id: z.string(), label: z.string() })),
  cachedAt: z.number(),
});

function cacheKey(provider: ProviderId): string {
  return `__signalx_models_v1:${provider}`;
}

async function readCache(provider: ProviderId, now: number): Promise<ModelOption[] | null> {
  const raw = await readRaw(session(), cacheKey(provider));
  const parsed = cacheEntrySchema.safeParse(raw);
  if (!parsed.success) return null;
  if (now - parsed.data.cachedAt >= CACHE_TTL_MS) return null;
  return parsed.data.models;
}

async function writeCache(provider: ProviderId, models: readonly ModelOption[], now: number): Promise<void> {
  await writeRaw(session(), cacheKey(provider), { models, cachedAt: now });
}

// ───────────────────────── Public entry point ─────────────────────────

/**
 * List models for the given provider settings. Serves a fresh (<1h) cached live
 * list when available, else fetches live, else returns the static fallback.
 * NEVER hard-fails: always resolves ok().
 */
export async function listModels(
  settings: ProviderSettings,
  now = Date.now(),
): Promise<Result<ListModelsResult>> {
  const cached = await readCache(settings.provider, now);
  if (cached) return ok({ models: cached, source: 'live' });

  const live = await fetchLive(settings);
  if (live) {
    await writeCache(settings.provider, live, now);
    return ok({ models: live, source: 'live' });
  }
  return ok(fallback(settings.provider));
}
