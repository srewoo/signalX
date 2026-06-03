/** Static display catalogs: countries, categories, providers, models, source pips. */

import type { CountryCode, Category, ProviderId, SummaryType } from '../../shared/contracts';

export const COUNTRIES: readonly { code: CountryCode; flag: string; name: string }[] = [
  { code: 'IN', flag: '🇮🇳', name: 'India' },
  { code: 'US', flag: '🇺🇸', name: 'United States' },
  { code: 'GB', flag: '🇬🇧', name: 'United Kingdom' },
  { code: 'AU', flag: '🇦🇺', name: 'Australia' },
  { code: 'SG', flag: '🇸🇬', name: 'Singapore' },
  { code: 'AE', flag: '🇦🇪', name: 'UAE' },
  { code: 'GLOBAL', flag: '🌍', name: 'Global' },
];

export function country(code: CountryCode): { flag: string; name: string } {
  return COUNTRIES.find((c) => c.code === code) ?? { flag: '🌍', name: 'Global' };
}

export const CATEGORIES: readonly { id: Category; label: string }[] = [
  { id: 'top', label: 'Top' },
  { id: 'tech', label: 'Tech' },
  { id: 'business', label: 'Business' },
  { id: 'politics', label: 'Politics' },
  { id: 'sports', label: 'Sports' },
  { id: 'world', label: 'World' },
];

export const SUMMARY_TABS: readonly { type: SummaryType; label: string }[] = [
  { type: 'short', label: 'Short' },
  { type: 'detailed', label: 'Detailed' },
  { type: 'keyfacts', label: 'Key Facts' },
];

export const SUMMARY_LENGTHS: readonly { type: SummaryType; label: string }[] = [
  { type: 'short', label: 'Short (100 words)' },
  { type: 'detailed', label: 'Detailed (300 words)' },
  { type: 'keyfacts', label: 'Key Facts (bullets)' },
];

interface ProviderInfo { readonly id: ProviderId; readonly glyph: string; readonly name: string; readonly billingUrl: string }

export const PROVIDERS: readonly ProviderInfo[] = [
  { id: 'anthropic', glyph: '◈', name: 'Anthropic', billingUrl: 'https://console.anthropic.com/settings/billing' },
  { id: 'openai', glyph: '◯', name: 'OpenAI', billingUrl: 'https://platform.openai.com/account/billing' },
  { id: 'gemini', glyph: '◆', name: 'Gemini', billingUrl: 'https://aistudio.google.com/app/billing' },
  { id: 'openrouter', glyph: '⊞', name: 'OpenRouter', billingUrl: 'https://openrouter.ai/credits' },
];

const FALLBACK_PROVIDER: ProviderInfo = PROVIDERS[0] ?? { id: 'anthropic', glyph: '◈', name: 'Anthropic', billingUrl: 'https://console.anthropic.com/settings/billing' };

export function provider(id: ProviderId): ProviderInfo {
  return PROVIDERS.find((p) => p.id === id) ?? FALLBACK_PROVIDER;
}

export const MODELS: Readonly<Record<ProviderId, readonly { id: string; label: string }[]>> = {
  anthropic: [
    { id: 'claude-haiku-4-5', label: 'claude-haiku-4-5 (fast · cheap — recommended)' },
    { id: 'claude-sonnet-4-5', label: 'claude-sonnet-4-5 (balanced)' },
    { id: 'claude-opus-4-1', label: 'claude-opus-4-1 (highest quality)' },
  ],
  openai: [
    { id: 'gpt-4o-mini', label: 'gpt-4o-mini (fast · cheap — recommended)' },
    { id: 'gpt-4o', label: 'gpt-4o (balanced)' },
    { id: 'o4-mini', label: 'o4-mini (reasoning)' },
  ],
  gemini: [
    { id: 'gemini-2.0-flash', label: 'gemini-2.0-flash (fast · cheap — recommended)' },
    { id: 'gemini-2.5-pro', label: 'gemini-2.5-pro (highest quality)' },
  ],
  openrouter: [
    { id: 'anthropic/claude-haiku-4-5', label: 'claude-haiku-4-5 (via OpenRouter)' },
    { id: 'openai/gpt-4o-mini', label: 'gpt-4o-mini (via OpenRouter)' },
    { id: 'google/gemini-2.0-flash', label: 'gemini-2.0-flash (via OpenRouter)' },
  ],
};

/** Recommended (first) model id for a provider, guaranteed defined. */
export function defaultModel(id: ProviderId): string {
  return MODELS[id][0]?.id ?? 'claude-haiku-4-5';
}

/** Map a sourceId to a pip CSS class + single-letter initial used in the prototype. */
export function pipClass(sourceId: string): string {
  const map: Record<string, string> = {
    bbc: 'pip-bbc', cnn: 'pip-cnn', reuters: 'pip-reu', reu: 'pip-reu',
    toi: 'pip-toi', ht: 'pip-ht', thehindu: 'pip-toi', ie: 'pip-toi',
  };
  return map[sourceId.toLowerCase()] ?? 'pip-default';
}

/** Perspective card class for the comparison view, by source name. */
export function perspClass(sourceName: string): string {
  const n = sourceName.toLowerCase();
  if (n.includes('bbc')) return 'p-bbc';
  if (n.includes('cnn')) return 'p-cnn';
  if (n.includes('reuters')) return 'p-reu';
  if (n.includes('hindustan')) return 'p-ht';
  if (n.includes('times') || n.includes('hindu') || n.includes('express')) return 'p-toi';
  return '';
}

export function pipInitial(sourceName: string): string {
  return (sourceName.trim()[0] ?? '?').toUpperCase();
}
