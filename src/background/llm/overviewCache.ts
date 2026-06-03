import { local, readRaw, writeRaw } from '../storage/area';
import { z } from 'zod';

/**
 * Search-overview cache in chrome.storage.local, keyed normalized(query)+model,
 * 1h TTL, bounded to MAX_ENTRIES (oldest-inserted evicted first). Stored as a
 * single object so eviction is a cheap read-modify-write rather than a SCAN.
 */

const OVERVIEW_KEY = '__signalx_overview_v1';
const TTL_MS = 60 * 60 * 1000;
const MAX_ENTRIES = 50;

const entrySchema = z.object({
  overview: z.string(),
  model: z.string(),
  at: z.string(),
});
const mapSchema = z.record(entrySchema);

export interface OverviewCacheHit {
  readonly overview: string;
  readonly model: string;
}

/** Normalize a query for cache keying: lowercase + trim + collapse whitespace. */
export function normalizeQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ');
}

function cacheKey(query: string, model: string): string {
  return `${normalizeQuery(query)}::${model}`;
}

async function readMap(): Promise<Record<string, z.infer<typeof entrySchema>>> {
  const raw = await readRaw(local(), OVERVIEW_KEY);
  if (raw === undefined) return {};
  const parsed = mapSchema.safeParse(raw);
  return parsed.success ? parsed.data : {};
}

/** Return a cached overview if present and within TTL, else null. */
export async function readOverviewCache(
  query: string,
  model: string,
  now = Date.now(),
): Promise<OverviewCacheHit | null> {
  const map = await readMap();
  const entry = map[cacheKey(query, model)];
  if (!entry) return null;
  const ts = Date.parse(entry.at) || 0;
  if (now - ts > TTL_MS) return null;
  return { overview: entry.overview, model: entry.model };
}

/** Store an overview, evicting the oldest entries beyond MAX_ENTRIES. */
export async function writeOverviewCache(
  query: string,
  model: string,
  overview: string,
  now = Date.now(),
): Promise<void> {
  const map = await readMap();
  const key = cacheKey(query, model);
  // Re-insert at the end (delete first) so refreshed entries count as newest.
  delete map[key];
  map[key] = { overview, model, at: new Date(now).toISOString() };
  const keys = Object.keys(map);
  if (keys.length > MAX_ENTRIES) {
    // Object key order is insertion order; drop the oldest overflow.
    for (const k of keys.slice(0, keys.length - MAX_ENTRIES)) delete map[k];
  }
  await writeRaw(local(), OVERVIEW_KEY, map);
}
