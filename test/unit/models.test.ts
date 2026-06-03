import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { installChromeMock } from '../helpers/chromeMock';
import {
  parseOpenAiModels,
  parseAnthropicModels,
  parseGeminiModels,
  parseOpenRouterModels,
  FALLBACK_MODELS,
} from '../../src/background/llm/models';
import type { ProviderSettings } from '../../src/shared/contracts';

describe('parseOpenAiModels', () => {
  it('should keep only chat-capable gpt-* ids and exclude non-chat families', () => {
    const json = {
      data: [
        { id: 'gpt-5.1', created: 300 },
        { id: 'gpt-5-mini', created: 200 },
        { id: 'text-embedding-3-large', created: 999 },
        { id: 'gpt-4o-audio-preview', created: 500 },
        { id: 'whisper-1', created: 100 },
        { id: 'dall-e-3', created: 100 },
        { id: 'gpt-3.5-turbo-instruct', created: 50 },
      ],
    };
    const out = parseOpenAiModels(json);
    expect(out.map((m) => m.id)).toEqual(['gpt-5.1', 'gpt-5-mini']);
  });

  it('should sort newest-ish first by created desc', () => {
    const json = { data: [{ id: 'gpt-a', created: 1 }, { id: 'gpt-b', created: 9 }] };
    expect(parseOpenAiModels(json).map((m) => m.id)).toEqual(['gpt-b', 'gpt-a']);
  });

  it('should return empty array on malformed shape', () => {
    expect(parseOpenAiModels({ nope: true })).toEqual([]);
  });
});

describe('parseAnthropicModels', () => {
  it('should use display_name as label and id as id', () => {
    const json = {
      data: [
        { id: 'claude-opus-4-8', display_name: 'Claude Opus 4.8' },
        { id: 'claude-haiku-4-5' },
      ],
    };
    expect(parseAnthropicModels(json)).toEqual([
      { id: 'claude-opus-4-8', label: 'Claude Opus 4.8' },
      { id: 'claude-haiku-4-5', label: 'claude-haiku-4-5' },
    ]);
  });

  it('should return empty array on malformed shape', () => {
    expect(parseAnthropicModels(null)).toEqual([]);
  });
});

describe('parseGeminiModels', () => {
  it('should keep only generateContent models and strip the models/ prefix', () => {
    const json = {
      models: [
        { name: 'models/gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/embedding-001', supportedGenerationMethods: ['embedContent'] },
      ],
    };
    expect(parseGeminiModels(json)).toEqual([
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    ]);
  });

  it('should fall back to id as label when displayName absent', () => {
    const json = {
      models: [{ name: 'models/gemini-x', supportedGenerationMethods: ['generateContent'] }],
    };
    expect(parseGeminiModels(json)).toEqual([{ id: 'gemini-x', label: 'gemini-x' }]);
  });

  it('should return empty array on malformed shape', () => {
    expect(parseGeminiModels({})).toEqual([]);
  });
});

describe('parseOpenRouterModels', () => {
  it('should keep only major-vendor prefixes', () => {
    const json = {
      data: [
        { id: 'anthropic/claude-haiku-4.5' },
        { id: 'openai/gpt-5-mini' },
        { id: 'google/gemini-2.5-flash' },
        { id: 'meta-llama/llama-3.3-70b' },
        { id: 'mistralai/mistral-large' },
        { id: 'cohere/command-r' },
      ],
    };
    expect(parseOpenRouterModels(json).map((m) => m.id)).toEqual([
      'anthropic/claude-haiku-4.5',
      'openai/gpt-5-mini',
      'google/gemini-2.5-flash',
      'meta-llama/llama-3.3-70b',
    ]);
  });

  it('should cap the list at 30 entries', () => {
    const data = Array.from({ length: 50 }, (_, i) => ({ id: `openai/m-${i}` }));
    expect(parseOpenRouterModels({ data })).toHaveLength(30);
  });

  it('should return empty array on malformed shape', () => {
    expect(parseOpenRouterModels({ data: 'nope' })).toEqual([]);
  });
});

describe('listModels — caching and fallback', () => {
  const settings: ProviderSettings = { provider: 'openai', apiKey: 'sk-test', model: 'gpt-5-mini' };

  beforeEach(() => {
    vi.resetModules();
    installChromeMock();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('should return source:live and cache when the provider responds', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ data: [{ id: 'gpt-5.1', created: 9 }] }), { status: 200 })),
    );
    const { listModels } = await import('../../src/background/llm/models');
    const res = await listModels(settings);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.source).toBe('live');
      expect(res.value.models[0]?.id).toBe('gpt-5.1');
    }
  });

  it('should serve the cached live list within TTL without re-fetching', async () => {
    const fetchSpy = vi.fn(async () =>
      new Response(JSON.stringify({ data: [{ id: 'gpt-5.1', created: 9 }] }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchSpy);
    const { listModels } = await import('../../src/background/llm/models');
    const now = 1_000_000;
    await listModels(settings, now);
    const second = await listModels(settings, now + 60_000);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(second.ok && second.value.source).toBe('live');
  });

  it('should return source:fallback when the provider call fails (non-2xx)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));
    const { listModels } = await import('../../src/background/llm/models');
    const res = await listModels(settings);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.source).toBe('fallback');
      expect(res.value.models).toEqual(FALLBACK_MODELS.openai);
    }
  });

  it('should return source:fallback when fetch throws (offline)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network down'); }));
    const { listModels } = await import('../../src/background/llm/models');
    const res = await listModels(settings);
    expect(res.ok && res.value.source).toBe('fallback');
  });

  it('should never store the api key in the session cache', async () => {
    const fake = installChromeMock();
    vi.resetModules();
    vi.stubGlobal('chrome', fake);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ data: [{ id: 'gpt-5.1', created: 9 }] }), { status: 200 })),
    );
    const { listModels } = await import('../../src/background/llm/models');
    await listModels(settings);
    const dump = JSON.stringify([...fake.storage.session.store.entries()]);
    expect(dump).not.toContain('sk-test');
  });
});
