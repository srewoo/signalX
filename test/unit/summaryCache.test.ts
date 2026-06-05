import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { installChromeMock, type FakeChrome } from '../helpers/chromeMock';
import type { Summary, SummaryType } from '../../src/shared/contracts';

let fake: FakeChrome;

beforeEach(() => {
  vi.resetModules();
  fake = installChromeMock();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function load() {
  return import('../../src/background/llm/summaryCache');
}

function summary(clusterId: string, type: SummaryType = 'short', model = 'm1'): Summary {
  return {
    clusterId,
    type,
    sections: { whatHappened: `wh ${clusterId}`, keyEvents: [], importantQuotes: [], whatHappensNext: '' },
    model,
    latencyMs: 100,
    estCostUsd: 0.0012,
    cached: false,
    generatedAt: new Date().toISOString(),
  };
}

describe('summaryCache', () => {
  it('should round-trip a summary keyed by provider+model+type+cluster', async () => {
    const { writeSummaryCache, readSummaryCache } = await load();
    await writeSummaryCache(summary('c1'), 'openai');

    const hit = await readSummaryCache('c1', 'short', 'openai', 'm1');
    expect(hit).not.toBeNull();
    expect(hit!.cached).toBe(true);
    expect(hit!.estCostUsd).toBe(0); // cached reads are free
  });

  it('should not return a summary for a different provider with the same model id', async () => {
    const { writeSummaryCache, readSummaryCache } = await load();
    await writeSummaryCache(summary('c1'), 'openai');

    // Same model id, different provider — must miss (no cross-provider bleed).
    expect(await readSummaryCache('c1', 'short', 'openrouter', 'm1')).toBeNull();
  });

  it('should bound the cache to MAX_ENTRIES (LRU eviction)', async () => {
    const { writeSummaryCache, readSummaryCache } = await load();
    for (let i = 0; i < 210; i++) await writeSummaryCache(summary(`c${i}`), 'openai');

    // The first-written should have been evicted; the newest survive.
    expect(await readSummaryCache('c0', 'short', 'openai', 'm1')).toBeNull();
    expect(await readSummaryCache('c209', 'short', 'openai', 'm1')).not.toBeNull();
  });

  it('should swallow a write failure (best-effort) instead of throwing', async () => {
    const { writeSummaryCache } = await load();
    // Force the underlying storage write to reject (e.g. quota exceeded).
    fake.storage.local.set = vi.fn(async () => {
      throw new Error('QUOTA_BYTES quota exceeded');
    });
    await expect(writeSummaryCache(summary('c1'), 'openai')).resolves.toBeUndefined();
  });
});
