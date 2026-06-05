import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { installChromeMock } from '../helpers/chromeMock';
import type { StoryCluster } from '../../src/shared/contracts';

beforeEach(() => {
  vi.resetModules();
  installChromeMock();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function load() {
  return import('../../src/background/feeds/cache');
}

function makeCluster(id: string): StoryCluster {
  return {
    id,
    headline: `Headline ${id}`,
    articles: [
      {
        id: `art-${id}`,
        title: `Title ${id}`,
        url: `https://example.com/${id}`,
        sourceId: 'src',
        sourceName: 'Source',
        publishedAt: '2026-06-03T10:00:00.000Z',
      },
    ],
    newestAt: '2026-06-03T10:00:00.000Z',
  };
}

describe('resolveCluster', () => {
  it('should return the indexed cluster when present', async () => {
    const { indexClusters, resolveCluster } = await load();
    const cluster = makeCluster('c1');
    await indexClusters([cluster]);

    const resolved = await resolveCluster('c1');
    expect(resolved).toEqual(cluster);
  });

  it('should fall back to the supplied payload when the id is not indexed', async () => {
    const { resolveCluster } = await load();
    const cluster = makeCluster('c2');

    const resolved = await resolveCluster('c2', cluster);
    expect(resolved).toEqual(cluster);
  });

  it('should adopt the fallback into the index so later lookups resolve it', async () => {
    const { resolveCluster, getClusterById } = await load();
    const cluster = makeCluster('c3');

    await resolveCluster('c3', cluster);
    const found = await getClusterById('c3');
    expect(found).toEqual(cluster);
  });

  it('should return null when not indexed and no fallback is given', async () => {
    const { resolveCluster } = await load();
    expect(await resolveCluster('missing')).toBeNull();
  });

  it('should reject a fallback whose id does not match the requested id', async () => {
    const { resolveCluster } = await load();
    const cluster = makeCluster('c4');

    // A mismatched payload must never be trusted (panel/background id drift).
    expect(await resolveCluster('different-id', cluster)).toBeNull();
  });

  it('should reject a malformed fallback payload', async () => {
    const { resolveCluster } = await load();
    const bad = { id: 'c5', headline: 'x' } as unknown as StoryCluster;
    expect(await resolveCluster('c5', bad)).toBeNull();
  });
});

describe('indexClusters eviction (MRU)', () => {
  // The index is bounded at MAX_INDEXED_CLUSTERS (300). These tests assert it
  // evicts the LEAST-recently-touched entries, not the newest displayed ones.
  it('should keep the newest stories and evict the least-recently-touched', async () => {
    const { indexClusters, getClusterById } = await load();

    // Fill the index past its 300 cap. A feed load delivers clusters
    // newest-first; the first cluster in the array is the freshest headline.
    const batch = Array.from({ length: 320 }, (_, i) => makeCluster(`c${i}`));
    await indexClusters(batch);

    // The newest (front of the newest-first array) must survive.
    expect(await getClusterById('c0')).not.toBeNull();
    expect(await getClusterById('c1')).not.toBeNull();
    // The oldest (tail of the array) is the overflow and should be evicted.
    expect(await getClusterById('c319')).toBeNull();
  });

  it('should protect a re-touched cluster from eviction (true recency)', async () => {
    const { indexClusters, getClusterById } = await load();

    // 'keepme' is inserted first (oldest by insertion), filling the index to
    // its cap alongside 299 others.
    await indexClusters([makeCluster('keepme')]);
    const fill = Array.from({ length: 299 }, (_, i) => makeCluster(`x${i}`));
    await indexClusters(fill);

    // Re-touch 'keepme' (as a later feed load would), moving it to the
    // most-recent end. Without delete-then-set it would stay at the front.
    await indexClusters([makeCluster('keepme')]);

    // One more new cluster overflows the cap by 1, evicting the current front.
    await indexClusters([makeCluster('newest')]);

    // 'keepme' was re-touched after x298, so x298 is now the least-recent and
    // gets evicted; 'keepme' survives.
    expect(await getClusterById('keepme')).not.toBeNull();
    expect(await getClusterById('x298')).toBeNull();
  });
});
