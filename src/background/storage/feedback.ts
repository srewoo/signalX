import type { SummaryType } from '../../shared/contracts';
import { local, readRaw, writeRaw } from './area';
import { feedbackEntrySchema } from './schemas';
import { z } from 'zod';

/** Append-only local log of summary thumbs up/down. Bounded to avoid unbounded growth. */

const FEEDBACK_KEY = '__signalx_feedback_v1';
const MAX_ENTRIES = 1000;

const feedbackArr = z.array(feedbackEntrySchema);

async function read(): Promise<z.infer<typeof feedbackArr>> {
  const raw = await readRaw(local(), FEEDBACK_KEY);
  if (raw === undefined) return [];
  const parsed = feedbackArr.safeParse(raw);
  return parsed.success ? parsed.data : [];
}

export async function appendFeedback(
  clusterId: string,
  target: 'summary' | 'comparison',
  verdict: 'up' | 'down',
  summaryType?: SummaryType,
): Promise<void> {
  const entries = await read();
  const entry = {
    clusterId,
    target,
    verdict,
    at: new Date().toISOString(),
    // Only record summaryType for summary feedback; comparison has none.
    ...(target === 'summary' && summaryType ? { summaryType } : {}),
  };
  const next = [...entries, entry];
  // Keep only the most recent MAX_ENTRIES.
  const trimmed = next.length > MAX_ENTRIES ? next.slice(next.length - MAX_ENTRIES) : next;
  await writeRaw(local(), FEEDBACK_KEY, trimmed);
}
