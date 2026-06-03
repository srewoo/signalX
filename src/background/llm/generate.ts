import type {
  ProviderSettings,
  Result,
  SourceComparison,
  StoryCluster,
  Summary,
  SummarySections,
  SummaryType,
} from '../../shared/contracts';
import { appError, err, ok } from '../result';
import { streamWithRetry } from './client';
import { estCostUsd } from './cost';
import {
  parseComparison,
  parseSummarySections,
  progressiveWhatHappened,
  stripJsonScaffolding,
} from './parse';
import { buildComparePrompt, buildOverviewPrompt, buildSummaryPrompt } from './prompts';
import { readOverviewCache, writeOverviewCache } from './overviewCache';
import { readSummaryCache, writeSummaryCache } from './summaryCache';

const SUMMARY_MAX_TOKENS = 1200;
const COMPARE_MAX_TOKENS = 1400;
const OVERVIEW_MAX_TOKENS = 300;

/** Callback for live "whatHappened" progress during summary streaming. */
export type WhatHappenedListener = (text: string) => void;

/**
 * Generate a summary (cache-first). On a stream, emits progressive
 * "whatHappened" text via onWhatHappened. Returns a fully parsed Summary.
 */
export async function generateSummary(
  cluster: StoryCluster,
  type: SummaryType,
  settings: ProviderSettings,
  onWhatHappened: WhatHappenedListener,
  signal?: AbortSignal,
): Promise<Result<Summary>> {
  const cached = await readSummaryCache(cluster.id, type, settings.model);
  if (cached) {
    onWhatHappened(cached.sections.whatHappened);
    return ok(cached);
  }

  const { system, user } = buildSummaryPrompt(cluster, type);
  const started = Date.now();
  let raw = '';
  let lastEmitted = '';
  const res = await streamWithRetry(
    settings,
    system,
    user,
    SUMMARY_MAX_TOKENS,
    (chunk) => {
      raw += chunk;
      const wh = progressiveWhatHappened(raw);
      if (wh && wh !== lastEmitted) {
        lastEmitted = wh;
        onWhatHappened(wh);
      }
    },
    signal,
  );
  if (!res.ok) return err(res.error);

  // Aborted by the user mid-stream: never cache a truncated/partial summary.
  // The caller (stream.ts) drops this result without posting, so the message
  // is a guard-rail only and never reaches the user.
  if (signal?.aborted) return err(appError('INTERNAL', 'Cancelled.'));

  const sections: SummarySections = parseSummarySections(res.value.text);
  if (sections.whatHappened && sections.whatHappened !== lastEmitted) {
    onWhatHappened(sections.whatHappened);
  }
  const summary: Summary = {
    clusterId: cluster.id,
    type,
    sections,
    model: settings.model,
    latencyMs: Date.now() - started,
    estCostUsd: estCostUsd(settings.provider, settings.model, system + user, res.value.text),
    cached: false,
    generatedAt: new Date().toISOString(),
  };
  await writeSummaryCache(summary);
  return ok(summary);
}

export interface OverviewResult {
  readonly overview: string;
  readonly model: string;
  readonly estCostUsd: number;
  readonly cached: boolean;
}

/**
 * Generate a plain-prose AI overview of the news landscape for a query, given
 * the resolved clusters. Cache-first (1h, keyed query+model). Non-streamed:
 * reuses streamWithRetry, which accumulates deltas into full text. Output is
 * defensively stripped of any JSON scaffolding before returning.
 */
export async function generateOverview(
  query: string,
  clusters: readonly StoryCluster[],
  settings: ProviderSettings,
): Promise<Result<OverviewResult>> {
  const cached = await readOverviewCache(query, settings.model);
  if (cached) {
    return ok({ overview: cached.overview, model: cached.model, estCostUsd: 0, cached: true });
  }

  const { system, user } = buildOverviewPrompt(query, clusters);
  const res = await streamWithRetry(settings, system, user, OVERVIEW_MAX_TOKENS, () => {
    /* overview is not streamed to the UI */
  });
  if (!res.ok) return err(res.error);

  const overview = stripJsonScaffolding(res.value.text).trim();
  if (!overview) {
    return err(appError('PROVIDER_ERROR', 'The model returned an empty overview. Try again.'));
  }
  await writeOverviewCache(query, settings.model, overview);
  return ok({
    overview,
    model: settings.model,
    estCostUsd: estCostUsd(settings.provider, settings.model, system + user, res.value.text),
    cached: false,
  });
}

/** Generate a source comparison (non-streamed; returns parsed result). */
export async function generateComparison(
  cluster: StoryCluster,
  settings: ProviderSettings,
): Promise<Result<SourceComparison>> {
  const { system, user } = buildComparePrompt(cluster);
  const res = await streamWithRetry(settings, system, user, COMPARE_MAX_TOKENS, () => {
    /* comparison is not streamed to the UI */
  });
  if (!res.ok) return err(res.error);
  return ok(parseComparison(res.value.text, cluster.id));
}
