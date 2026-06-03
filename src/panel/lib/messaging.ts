/**
 * Typed transport between the panel and the background service worker.
 * Panel code never touches chrome.runtime directly — it goes through here, so
 * the message protocol from contracts.ts is enforced at the type level.
 */

import {
  STREAM_PORT,
  type Request,
  type ResponseMap,
  type Result,
  type StreamStart,
  type StreamEvent,
  type AppError,
  type Summary,
  type SummarySections,
} from '../../shared/contracts';

/** Narrow a request literal to its matching response type. */
type ResponseFor<R extends Request> = R extends { type: infer T }
  ? T extends keyof ResponseMap
    ? ResponseMap[T]
    : never
  : never;

const TRANSPORT_ERROR: AppError = {
  code: 'INTERNAL',
  message: 'Could not reach the SignalX background service. Please reload the panel.',
};

/**
 * Send a typed request and resolve to a Result. Transport failures (e.g. the
 * service worker is asleep or absent) are mapped to an INTERNAL AppError rather
 * than thrown, so callers always handle a single Result shape.
 */
export async function send<R extends Request>(req: R): Promise<Result<ResponseFor<R>>> {
  try {
    const res = (await chrome.runtime.sendMessage(req)) as Result<ResponseFor<R>> | undefined;
    if (!res || typeof res !== 'object' || !('ok' in res)) {
      return { ok: false, error: TRANSPORT_ERROR };
    }
    return res;
  } catch {
    return { ok: false, error: TRANSPORT_ERROR };
  }
}

export interface StreamHandlers {
  readonly onDelta: (section: keyof SummarySections, text: string) => void;
  readonly onDone: (summary: Summary) => void;
  readonly onError: (error: AppError) => void;
}

export interface StreamController {
  /** Disconnect the port — backs the "◼ Stop" control. */
  readonly stop: () => void;
}

/**
 * Open the summary streaming port and wire its events to handlers. Returns a
 * controller whose stop() disconnects the port. A disconnect that was not
 * user-initiated and produced no done/error is surfaced as an INTERNAL error.
 */
export function openSummaryStream(start: StreamStart, handlers: StreamHandlers): StreamController {
  const port = chrome.runtime.connect({ name: STREAM_PORT });
  let settled = false;
  let stoppedByUser = false;

  port.onMessage.addListener((msg: unknown) => {
    const event = msg as StreamEvent;
    if (event.type === 'delta') {
      handlers.onDelta(event.section, event.text);
    } else if (event.type === 'done') {
      settled = true;
      handlers.onDone(event.summary);
    } else if (event.type === 'error') {
      settled = true;
      handlers.onError(event.error);
    }
  });

  port.onDisconnect.addListener(() => {
    if (settled || stoppedByUser) return;
    handlers.onError({
      code: 'INTERNAL',
      message: 'The summary stream ended unexpectedly. Please try again.',
    });
  });

  port.postMessage(start);

  return {
    stop: () => {
      stoppedByUser = true;
      port.disconnect();
    },
  };
}
