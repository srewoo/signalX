import type { StoryCluster } from '../../shared/contracts';
import { readRaw, session, writeRaw } from '../storage/area';
import { z } from 'zod';

/**
 * Feed cache (storage.session, 5-min TTL, stale-while-revalidate) plus a
 * clusterId -> cluster lookup that survives SW restarts (storage.session). The
 * latter lets summary/compare resolve a clusterId even after the worker dies.
 */

export const FEED_TTL_MS = 5 * 60 * 1000;
const CLUSTER_INDEX_KEY = '__signalx_cluster_index_v1';
const MAX_INDEXED_CLUSTERS = 300;

const articleSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string(),
  sourceId: z.string(),
  sourceName: z.string(),
  publishedAt: z.string(),
  snippet: z.string().optional(),
});

const clusterSchema = z.object({
  id: z.string(),
  headline: z.string(),
  articles: z.array(articleSchema),
  newestAt: z.string(),
});

const cacheEntrySchema = z.object({
  clusters: z.array(clusterSchema),
  fetchedAt: z.string(),
});

type CacheEntry = z.infer<typeof cacheEntrySchema>;

function feedKey(scope: string): string {
  return `__signalx_feed_v1:${scope}`;
}

export interface CachedFeed {
  readonly clusters: readonly StoryCluster[];
  readonly fetchedAt: string;
  readonly fresh: boolean;
}

/** Read a cached feed for a scope. Returns null if nothing cached. */
export async function readFeedCache(scope: string, now = Date.now()): Promise<CachedFeed | null> {
  const raw = await readRaw(session(), feedKey(scope));
  if (raw === undefined) return null;
  const parsed = cacheEntrySchema.safeParse(raw);
  if (!parsed.success) return null;
  const fetchedTs = Date.parse(parsed.data.fetchedAt) || 0;
  return {
    clusters: parsed.data.clusters as readonly StoryCluster[],
    fetchedAt: parsed.data.fetchedAt,
    fresh: now - fetchedTs < FEED_TTL_MS,
  };
}

export async function writeFeedCache(
  scope: string,
  clusters: readonly StoryCluster[],
  fetchedAt: string,
): Promise<void> {
  const entry: CacheEntry = { clusters: clusters as CacheEntry['clusters'], fetchedAt };
  await writeRaw(session(), feedKey(scope), entry);
  await indexClusters(clusters);
}

// The cluster index is a read-modify-write on storage.session. Concurrent
// feed/trending/search calls would otherwise interleave their read and write
// and clobber each other's entries (lost updates → spurious "story no longer
// available"). Serialize all writes through a single in-memory promise chain so
// each read-modify-write runs to completion before the next begins.
let indexWriteQueue: Promise<void> = Promise.resolve();

async function applyIndexWrite(clusters: readonly StoryCluster[]): Promise<void> {
  const raw = await readRaw(session(), CLUSTER_INDEX_KEY);
  const map: Record<string, unknown> =
    raw && typeof raw === 'object' ? { ...(raw as Record<string, unknown>) } : {};
  for (const c of clusters) map[c.id] = c;
  const keys = Object.keys(map);
  if (keys.length > MAX_INDEXED_CLUSTERS) {
    // Drop oldest-inserted overflow (object key order is insertion order).
    for (const k of keys.slice(0, keys.length - MAX_INDEXED_CLUSTERS)) delete map[k];
  }
  await writeRaw(session(), CLUSTER_INDEX_KEY, map);
}

/** Persist clusters into the id->cluster index (storage.session, bounded LRU-ish). */
export function indexClusters(clusters: readonly StoryCluster[]): Promise<void> {
  // Chain onto the queue; a failed write must not break the chain for later
  // callers, so swallow its rejection at the link boundary (the awaited return
  // still surfaces this call's own error).
  const run = indexWriteQueue.then(() => applyIndexWrite(clusters));
  indexWriteQueue = run.catch(() => undefined);
  return run;
}

/** Resolve a cluster by id from the session index. Survives SW restarts. */
export async function getClusterById(id: string): Promise<StoryCluster | null> {
  const raw = await readRaw(session(), CLUSTER_INDEX_KEY);
  if (!raw || typeof raw !== 'object') return null;
  const entry = (raw as Record<string, unknown>)[id];
  if (entry === undefined) return null;
  const parsed = clusterSchema.safeParse(entry);
  return parsed.success ? (parsed.data as StoryCluster) : null;
}
