import type { ProviderId } from '../../shared/contracts';

/**
 * Rough cost estimation. Token count is approximated as chars/4 (good enough
 * for a BYOK transparency hint, not billing). Prices are USD per 1M tokens and
 * intentionally conservative; unknown models fall back to a default.
 */

const CHARS_PER_TOKEN = 4;

interface Price {
  readonly inPerM: number;
  readonly outPerM: number;
}

// Defaults are the mid-tier model for each provider, NOT the cheapest: an
// unknown model is more likely a new flagship than a budget SKU, so a low
// default would under-report cost (the old anthropic 0.8/4 under-reported Opus
// ~15x). Better to slightly over-estimate than mislead.
const DEFAULTS: Record<ProviderId, Price> = {
  anthropic: { inPerM: 3, outPerM: 15 },
  openai: { inPerM: 1.25, outPerM: 10 },
  gemini: { inPerM: 2, outPerM: 12 },
  openrouter: { inPerM: 1.25, outPerM: 10 },
};

const MODEL_PRICES: Record<string, Price> = {
  'claude-haiku-4-5': { inPerM: 1, outPerM: 5 },
  'claude-sonnet-4-6': { inPerM: 3, outPerM: 15 },
  'claude-opus-4-8': { inPerM: 5, outPerM: 25 },
  'gpt-5-mini': { inPerM: 0.25, outPerM: 2 },
  'gpt-5.1': { inPerM: 1.25, outPerM: 10 },
  'gpt-5-nano': { inPerM: 0.05, outPerM: 0.4 },
  'gemini-2.5-flash': { inPerM: 0.3, outPerM: 2.5 },
  'gemini-2.5-flash-lite': { inPerM: 0.1, outPerM: 0.4 },
  'gemini-3-pro-preview': { inPerM: 2, outPerM: 12 },
  'anthropic/claude-haiku-4.5': { inPerM: 1, outPerM: 5 },
  'openai/gpt-5-mini': { inPerM: 0.25, outPerM: 2 },
  'google/gemini-2.5-flash': { inPerM: 0.3, outPerM: 2.5 },
};

export function estTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/** Estimated USD cost for a request given prompt + completion text. */
export function estCostUsd(
  provider: ProviderId,
  model: string,
  promptText: string,
  completionText: string,
): number {
  const price = MODEL_PRICES[model] ?? DEFAULTS[provider];
  const inTokens = estTokens(promptText);
  const outTokens = estTokens(completionText);
  const cost = (inTokens / 1_000_000) * price.inPerM + (outTokens / 1_000_000) * price.outPerM;
  return Math.round(cost * 1_000_000) / 1_000_000;
}
