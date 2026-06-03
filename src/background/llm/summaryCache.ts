import type { Summary, SummaryType } from '../../shared/contracts';
import { local, readRaw, writeRaw } from '../storage/area';
import { cachedSummarySchema } from '../storage/schemas';

/** Summary cache in chrome.storage.local, keyed clusterId+type+model, 24h TTL. */

const TTL_MS = 24 * 60 * 60 * 1000;

function key(clusterId: string, type: SummaryType, model: string): string {
  return `__signalx_summary_v1:${clusterId}:${type}:${model}`;
}

/** Return a cached summary if present and within TTL, else null. */
export async function readSummaryCache(
  clusterId: string,
  type: SummaryType,
  model: string,
  now = Date.now(),
): Promise<Summary | null> {
  const raw = await readRaw(local(), key(clusterId, type, model));
  if (raw === undefined) return null;
  const parsed = cachedSummarySchema.safeParse(raw);
  if (!parsed.success) return null;
  const ts = Date.parse(parsed.data.generatedAt) || 0;
  if (now - ts > TTL_MS) return null;
  return { ...(parsed.data as Summary), cached: true, estCostUsd: 0 };
}

export async function writeSummaryCache(summary: Summary): Promise<void> {
  await writeRaw(local(), key(summary.clusterId, summary.type, summary.model), summary);
}
