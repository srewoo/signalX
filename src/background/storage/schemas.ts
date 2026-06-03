import { z } from 'zod';

/** Zod schemas validating everything we read back out of chrome.storage. */

export const providerIdSchema = z.enum(['anthropic', 'openai', 'gemini', 'openrouter']);

export const encryptedSchema = z.object({
  iv: z.string().min(1),
  data: z.string().min(1),
});

export const storedProviderSchema = z.object({
  provider: providerIdSchema,
  apiKey: encryptedSchema,
  model: z.string().min(1),
});

export const preferencesSchema = z.object({
  country: z.enum(['IN', 'US', 'GB', 'AU', 'SG', 'AE', 'GLOBAL']),
  defaultSummaryType: z.enum(['short', 'detailed', 'keyfacts']),
  theme: z.enum(['auto', 'light', 'dark']),
});

export const folderSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
});

const articleSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string(),
  sourceId: z.string(),
  sourceName: z.string(),
  publishedAt: z.string(),
  snippet: z.string().optional(),
});

const summarySectionsSchema = z.object({
  whatHappened: z.string(),
  keyEvents: z.array(z.string()).readonly(),
  importantQuotes: z.array(z.string()).readonly(),
  whatHappensNext: z.string(),
  keyFacts: z.array(z.string()).readonly().optional(),
});

const summarySchema = z.object({
  clusterId: z.string(),
  type: z.enum(['short', 'detailed', 'keyfacts']),
  sections: summarySectionsSchema,
  model: z.string(),
  latencyMs: z.number(),
  estCostUsd: z.number(),
  cached: z.boolean(),
  generatedAt: z.string(),
});

export const savedItemSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('article'),
    id: z.string().min(1),
    folderId: z.string().min(1),
    savedAt: z.string(),
    article: articleSchema,
  }),
  z.object({
    kind: z.literal('summary'),
    id: z.string().min(1),
    folderId: z.string().min(1),
    savedAt: z.string(),
    headline: z.string(),
    summary: summarySchema,
  }),
]);

export const cachedSummarySchema = summarySchema;

export const feedbackEntrySchema = z.object({
  clusterId: z.string(),
  target: z.enum(['summary', 'comparison']),
  // Present for 'summary' feedback, absent for 'comparison'.
  summaryType: z.enum(['short', 'detailed', 'keyfacts']).optional(),
  verdict: z.enum(['up', 'down']),
  at: z.string(),
});
