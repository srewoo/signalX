import type { ProviderId } from '../../../shared/contracts';
import type { ProviderClient } from '../provider';
import { anthropicClient } from './anthropic';
import { geminiClient } from './gemini';
import { openaiClient, openrouterClient } from './openai';

const CLIENTS: Record<ProviderId, ProviderClient> = {
  anthropic: anthropicClient,
  openai: openaiClient,
  gemini: geminiClient,
  openrouter: openrouterClient,
};

export function clientFor(provider: ProviderId): ProviderClient {
  return CLIENTS[provider];
}
