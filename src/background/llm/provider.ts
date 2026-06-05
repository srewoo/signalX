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

/**
 * Read an SSE stream and invoke onEvent once per event with the concatenated
 * `data:` payload. Per the SSE spec, an event may span multiple `data:` lines
 * and is terminated by a blank line — accumulate until the boundary rather than
 * dispatching each line, so a provider that splits a payload doesn't break.
 * Handles CRLF, comment lines (`:`), and a trailing event with no final blank.
 */
export async function readSse(
  res: Response,
  onEvent: (data: string) => void,
  signal: AbortSignal,
): Promise<void> {
  const reader = res.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = '';
  let dataLines: string[] = [];
  const flush = (): void => {
    if (dataLines.length > 0) {
      onEvent(dataLines.join('\n'));
      dataLines = [];
    }
  };
  try {
    for (;;) {
      if (signal.aborted) throw new DOMException('aborted', 'AbortError');
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, nl).replace(/\r$/, '');
        buffer = buffer.slice(nl + 1);
        if (line === '') {
          flush(); // blank line = event boundary
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).replace(/^ /, '')); // strip one lead space per spec
        }
        // `:` comments and other fields (event:/id:/retry:) are ignored.
      }
    }
    // A final data line with no terminating newline stays in the buffer.
    const tail = buffer.replace(/\r$/, '');
    if (tail.startsWith('data:')) dataLines.push(tail.slice(5).replace(/^ /, ''));
    flush(); // a final event not followed by a blank line
  } finally {
    // releaseLock alone leaves the body buffering; cancel tears down the stream
    // on user abort so we stop reading (and the connection can close).
    if (signal.aborted) await reader.cancel().catch(() => undefined);
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
