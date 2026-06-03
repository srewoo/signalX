import type { Result } from '../../../shared/contracts';
import type { OnDelta, ProviderClient, StreamOptions, StreamSuccess } from '../provider';
import { readSse, runStream } from '../provider';

/** Google Gemini generateContent client with SSE streaming (alt=sse). */
export const geminiClient: ProviderClient = {
  async streamCompletion(opts: StreamOptions, onDelta: OnDelta): Promise<Result<StreamSuccess>> {
    const endpoint =
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(opts.model)}` +
      `:streamGenerateContent?alt=sse&key=${encodeURIComponent(opts.apiKey)}`;
    return runStream(
      () =>
        fetch(endpoint, {
          method: 'POST',
          signal: opts.signal,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: opts.system }] },
            contents: [{ role: 'user', parts: [{ text: opts.user }] }],
            generationConfig: { maxOutputTokens: opts.maxTokens },
          }),
        }),
      async (res) => {
        let text = '';
        await readSse(
          res,
          (data) => {
            try {
              const evt = JSON.parse(data) as {
                candidates?: { content?: { parts?: { text?: string }[] } }[];
              };
              const parts = evt.candidates?.[0]?.content?.parts ?? [];
              for (const p of parts) {
                if (p.text) {
                  text += p.text;
                  onDelta(p.text);
                }
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
