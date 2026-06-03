import type { Result } from '../../../shared/contracts';
import type { OnDelta, ProviderClient, StreamOptions, StreamSuccess } from '../provider';
import { readSse, runStream } from '../provider';

/** Anthropic Messages API client with SSE streaming (direct browser access). */
export const anthropicClient: ProviderClient = {
  async streamCompletion(opts: StreamOptions, onDelta: OnDelta): Promise<Result<StreamSuccess>> {
    return runStream(
      () =>
        fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          signal: opts.signal,
          headers: {
            'content-type': 'application/json',
            'x-api-key': opts.apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify({
            model: opts.model,
            max_tokens: opts.maxTokens,
            stream: true,
            system: opts.system,
            messages: [{ role: 'user', content: opts.user }],
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
                type?: string;
                delta?: { type?: string; text?: string };
              };
              if (evt.type === 'content_block_delta' && evt.delta?.text) {
                text += evt.delta.text;
                onDelta(evt.delta.text);
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
