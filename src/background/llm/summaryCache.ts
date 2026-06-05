import type { ProviderId, Summary, SummaryType } from '../../shared/contracts';
import { local, readRaw, withSerializedWrite, writeRaw } from '../storage/area';
import { cachedSummarySchema } from '../storage/schemas';
import { PROMPT_VERSION } from './prompts';
import { log } from '../logger';
import { z } from 'zod';

/**
 * Summary cache in chrome.storage.local. Stored as a single bounded object (LRU,
 * MAX_ENTRIES) keyed provider+model+type+clusterId, 24h TTL. The bound matters:
 * the previous one-key-per-summary design grew without limit until it hit the
 * storage quota, at which point the write threw and failed an already-generated
 * summary. The key includes `provider` so the same model id served by two
 * providers (e.g. native vs OpenRouter) can't return one's summary for the other.
 */

const SUMMARY_KEY = '__signalx_summary_v2';
const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 200;

const mapSchema = z.record(cachedSummarySchema);

function entryKey(clusterId: string, type: SummaryType, provider: ProviderId, model: string): string {
  // PROMPT_VERSION is part of the key so a prompt change invalidates stale
  // cached summaries instead of serving the old wording for up to the TTL.
  return `${PROMPT_VERSION}:${provider}:${model}:${type}:${clusterId}`;
}

async function readMap(): Promise<Record<string, z.infer<typeof cachedSummarySchema>>> {
  const raw = await readRaw(local(), SUMMARY_KEY);
  if (raw === undefined) return {};
  const parsed = mapSchema.safeParse(raw);
  return parsed.success ? parsed.data : {};
}

/** Return a cached summary if present and within TTL, else null. */
export async function readSummaryCache(
  clusterId: string,
  type: SummaryType,
  provider: ProviderId,
  model: string,
  now = Date.now(),
): Promise<Summary | null> {
  const map = await readMap();
  const entry = map[entryKey(clusterId, type, provider, model)];
  if (!entry) return null;
  const ts = Date.parse(entry.generatedAt) || 0;
  if (now - ts > TTL_MS) return null;
  return { ...(entry as Summary), cached: true, estCostUsd: 0 };
}

/**
 * Persist a summary. Best-effort: a quota/serialization failure is logged and
 * swallowed so it never fails the summary the caller already generated.
 */
export async function writeSummaryCache(summary: Summary, provider: ProviderId): Promise<void> {
  try {
    await withSerializedWrite(SUMMARY_KEY, async () => {
      const map = await readMap();
      const k = entryKey(summary.clusterId, summary.type, provider, summary.model);
      // Re-insert at the end so refreshed entries count as most-recent.
      delete map[k];
      map[k] = summary;
      const keys = Object.keys(map);
      if (keys.length > MAX_ENTRIES) {
        for (const kk of keys.slice(0, keys.length - MAX_ENTRIES)) delete map[kk];
      }
      await writeRaw(local(), SUMMARY_KEY, map);
    });
  } catch (e) {
    log.warn('summary cache write failed; continuing', {
      reason: e instanceof Error ? e.name : 'unknown',
    });
  }
}
