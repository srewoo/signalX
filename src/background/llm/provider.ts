import type { AppError, Result } from '../../shared/contracts';
import { mapHttpError, mapThrownError } from './errors';

/** Common provider client interface. All clients stream and never throw. */

export interface StreamOptions {
  readonly apiKey: string;
  readonly model: string;
  readonly system: string;
  readonly user: string;
  readonly maxTokens: number;
  readonly signal: AbortSignal;
}

export interface StreamSuccess {
  readonly text: string;
}

export type OnDelta = (chunk: string) => void;

export interface ProviderClient {
  /** Stream a completion, invoking onDelta with text chunks; returns full text. */
  streamCompletion(opts: StreamOptions, onDelta: OnDelta): Promise<Result<StreamSuccess>>;
}

const ok = (text: string): Result<StreamSuccess> => ({ ok: true, value: { text } });
const fail = (error: AppError): Result<StreamSuccess> => ({ ok: false, error });

/** Read an SSE stream line-by-line, invoking onEvent for each `data:` payload. */
export async function readSse(
  res: Response,
  onEvent: (data: string) => void,
  signal: AbortSignal,
): Promise<void> {
  const reader = res.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      if (signal.aborted) throw new DOMException('aborted', 'AbortError');
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (line.startsWith('data:')) onEvent(line.slice(5).trim());
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/** Shared response/error handling wrapper for a fetch-based stream call. */
export async function runStream(
  doFetch: () => Promise<Response>,
  consume: (res: Response) => Promise<string>,
): Promise<Result<StreamSuccess>> {
  try {
    const res = await doFetch();
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return fail(mapHttpError(res.status, body, res.headers.get('retry-after')));
    }
    const text = await consume(res);
    return ok(text);
  } catch (e) {
    return fail(mapThrownError(e));
  }
}
