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

const DEFAULTS: Record<ProviderId, Price> = {
  anthropic: { inPerM: 0.8, outPerM: 4 },
  openai: { inPerM: 0.5, outPerM: 1.5 },
  gemini: { inPerM: 0.35, outPerM: 1.05 },
  openrouter: { inPerM: 0.5, outPerM: 1.5 },
};

const MODEL_PRICES: Record<string, Price> = {
  'claude-3-5-haiku-latest': { inPerM: 0.8, outPerM: 4 },
  'claude-3-5-sonnet-latest': { inPerM: 3, outPerM: 15 },
  'gpt-4o-mini': { inPerM: 0.15, outPerM: 0.6 },
  'gpt-4o': { inPerM: 2.5, outPerM: 10 },
  'gemini-1.5-flash': { inPerM: 0.075, outPerM: 0.3 },
  'gemini-1.5-pro': { inPerM: 1.25, outPerM: 5 },
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
