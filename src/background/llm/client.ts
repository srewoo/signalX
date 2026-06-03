import type { ProviderSettings, Result } from '../../shared/contracts';
import { appError, err, ok } from '../result';
import { backoffMs, delay, retryBudget } from './errors';
import type { OnDelta, StreamSuccess } from './provider';
import { clientFor } from './providers';

/** Orchestration: timeout, retry policy, and key validation across providers. */

const REQUEST_TIMEOUT_MS = 45_000;

interface RunResult {
  readonly text: string;
}

/**
 * Stream a completion with the configured retry policy. Honors Retry-After on
 * 429, single retry on 5xx/timeout, no retry on key/billing errors. onDelta is
 * only forwarded from the final (successful) attempt's perspective — partial
 * deltas from a failed attempt are discarded by resetting the accumulator.
 */
export async function streamWithRetry(
  settings: ProviderSettings,
  system: string,
  user: string,
  maxTokens: number,
  onDelta: OnDelta,
  external?: AbortSignal,
): Promise<Result<RunResult>> {
  const client = clientFor(settings.provider);
  let attempt = 0;
  for (;;) {
    // Abort the fetch if EITHER the per-request timeout fires OR the caller's
    // external signal (e.g. the user disconnecting the stream port) fires.
    const controller = new AbortController();
    const onExternalAbort = (): void => controller.abort();
    if (external) {
      if (external.aborted) controller.abort();
      else external.addEventListener('abort', onExternalAbort, { once: true });
    }
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let streamed = '';
    const collect: OnDelta = (chunk) => {
      streamed += chunk;
      onDelta(chunk);
    };
    let res: Result<StreamSuccess>;
    try {
      res = await client.streamCompletion(
        {
          apiKey: settings.apiKey,
          model: settings.model,
          system,
          user,
          maxTokens,
          signal: controller.signal,
        },
        collect,
      );
    } finally {
      clearTimeout(timer);
      if (external) external.removeEventListener('abort', onExternalAbort);
    }
    if (res.ok) return ok({ text: res.value.text || streamed });

    // External (user) abort: stop immediately, never retry a cancelled request.
    if (external?.aborted) return err(res.error);

    const budget = retryBudget(res.error);
    if (attempt >= budget) return err(res.error);
    await delay(backoffMs(attempt, res.error.retryAfterSec));
    attempt++;
  }
}

/** Validate a key with a minimal 1-token request. Never retries. */
export async function testKey(settings: ProviderSettings): Promise<Result<{ valid: boolean }>> {
  const client = clientFor(settings.provider);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await client.streamCompletion(
      {
        apiKey: settings.apiKey,
        model: settings.model,
        system: 'Reply with the single character: ok',
        user: 'ping',
        maxTokens: 1,
        signal: controller.signal,
      },
      () => {
        /* discard */
      },
    );
    if (res.ok) return ok({ valid: true });
    if (res.error.code === 'INVALID_KEY' || res.error.code === 'BILLING') {
      return err(res.error);
    }
    // A non-auth error (e.g. provider hiccup) shouldn't claim the key is invalid.
    return err(appError('PROVIDER_ERROR', 'Could not validate the key right now. Try again.'));
  } finally {
    clearTimeout(timer);
  }
}
