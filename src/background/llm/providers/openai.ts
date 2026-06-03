import type { Result } from '../../../shared/contracts';
import type { OnDelta, ProviderClient, StreamOptions, StreamSuccess } from '../provider';
import { readSse, runStream } from '../provider';

/** gpt-5*, o-series and newer require max_completion_tokens (OpenAI endpoint only). */
function isGpt5Family(model: string): boolean {
  return /^(gpt-5|o\d)/.test(model);
}

/** OpenAI Chat Completions client with SSE streaming. */
function makeClient(endpoint: string, extraHeaders: Readonly<Record<string, string>> = {}): ProviderClient {
  return {
    async streamCompletion(opts: StreamOptions, onDelta: OnDelta): Promise<Result<StreamSuccess>> {
      return runStream(
        () =>
          fetch(endpoint, {
            method: 'POST',
            signal: opts.signal,
            headers: {
              'content-type': 'application/json',
              authorization: `Bearer ${opts.apiKey}`,
              ...extraHeaders,
            },
            body: JSON.stringify({
              model: opts.model,
              // GPT-5-family models reject the legacy `max_tokens` param and
              // require `max_completion_tokens`; older models accept it too only
              // on the OpenAI endpoint, so branch on model family for safety.
              ...(isGpt5Family(opts.model)
                ? { max_completion_tokens: opts.maxTokens }
                : { max_tokens: opts.maxTokens }),
              stream: true,
              messages: [
                { role: 'system', content: opts.system },
                { role: 'user', content: opts.user },
              ],
            }),
          }),
        async (res) => {
          let text = '';
          await readSse(
            res,
            (data) => {
              if (data === '[DONE]') return;
              try {
                const evt = JSON.parse(data) as {
                  choices?: { delta?: { content?: string } }[];
                };
                const piece = evt.choices?.[0]?.delta?.content;
                if (piece) {
                  text += piece;
                  onDelta(piece);
                }
              } catch {
                /* ignore malformed SSE chunk */
              }
            },
            opts.signal,
          );
          return text;
        },
      );
    },
  };
}

export const openaiClient: ProviderClient = makeClient('https://api.openai.com/v1/chat/completions');

/** OpenRouter is OpenAI-compatible; only the endpoint and a referer header differ. */
export const openrouterClient: ProviderClient = makeClient(
  'https://openrouter.ai/api/v1/chat/completions',
  { 'HTTP-Referer': 'https://signalx.extension', 'X-Title': 'SignalX' },
);
