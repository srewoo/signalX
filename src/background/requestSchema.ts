import { z } from 'zod';
import type { Request } from '../shared/contracts';

/** Runtime validation of incoming messages from the panel before dispatch. */

const country = z.enum(['IN', 'US', 'GB', 'AU', 'SG', 'AE', 'GLOBAL']);
const category = z.enum(['top', 'tech', 'business', 'politics', 'sports', 'world']);
const summaryType = z.enum(['short', 'detailed', 'keyfacts']);
const providerId = z.enum(['anthropic', 'openai', 'gemini', 'openrouter']);

const providerSettings = z.object({
  provider: providerId,
  apiKey: z.string().min(1),
  model: z.string().min(1),
});

const preferences = z.object({
  country,
  defaultSummaryType: summaryType,
  theme: z.enum(['auto', 'light', 'dark']),
});

const article = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string(),
  sourceId: z.string(),
  sourceName: z.string(),
  publishedAt: z.string(),
  snippet: z.string().optional(),
});

const summarySections = z.object({
  whatHappened: z.string(),
  keyEvents: z.array(z.string()),
  importantQuotes: z.array(z.string()),
  whatHappensNext: z.string(),
  keyFacts: z.array(z.string()).optional(),
});

const summary = z.object({
  clusterId: z.string(),
  type: summaryType,
  sections: summarySections,
  model: z.string(),
  latencyMs: z.number(),
  estCostUsd: z.number(),
  cached: z.boolean(),
  generatedAt: z.string(),
});

const savedItem = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('article'),
    id: z.string().min(1),
    folderId: z.string().min(1),
    savedAt: z.string(),
    article,
  }),
  z.object({
    kind: z.literal('summary'),
    id: z.string().min(1),
    folderId: z.string().min(1),
    savedAt: z.string(),
    headline: z.string(),
    summary,
  }),
]);

export const requestSchema: z.ZodType<Request> = z.discriminatedUnion('type', [
  z.object({ type: z.literal('feed/get'), country, category }),
  z.object({ type: z.literal('feed/trending'), country }),
  z.object({ type: z.literal('search/query'), query: z.string(), country }),
  z.object({ type: z.literal('summary/get'), clusterId: z.string(), summaryType }),
  z.object({ type: z.literal('compare/get'), clusterId: z.string() }),
  z.object({ type: z.literal('settings/getProvider') }),
  z.object({ type: z.literal('settings/setProvider'), settings: providerSettings }),
  z.object({ type: z.literal('settings/testKey'), settings: providerSettings }),
  z.object({ type: z.literal('settings/listModels'), settings: providerSettings }),
  z.object({ type: z.literal('settings/getPrefs') }),
  z.object({ type: z.literal('settings/setPrefs'), prefs: preferences }),
  z.object({ type: z.literal('bookmarks/listFolders') }),
  z.object({ type: z.literal('bookmarks/createFolder'), name: z.string().min(1) }),
  z.object({ type: z.literal('bookmarks/save'), item: savedItem }),
  z.object({ type: z.literal('bookmarks/list'), folderId: z.string().optional() }),
  z.object({ type: z.literal('bookmarks/remove'), id: z.string().min(1) }),
  z.object({
    type: z.literal('search/overview'),
    query: z.string().min(1),
    clusterIds: z.array(z.string()),
  }),
  z.object({
    type: z.literal('feedback/submit'),
    clusterId: z.string(),
    target: z.enum(['summary', 'comparison']),
    summaryType: summaryType.optional(),
    verdict: z.enum(['up', 'down']),
  }),
  z.object({ type: z.literal('tabs/openSources'), urls: z.array(z.string()) }),
]) as z.ZodType<Request>;
