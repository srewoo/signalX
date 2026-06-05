import type { StreamEvent, StreamStart } from '../shared/contracts';
import { appError } from './result';
import { resolveCluster } from './feeds/cache';
import { getProvider } from './storage/settings';
import { generateSummary } from './llm/generate';
import { log } from './logger';

/** Type guard for the StreamStart message on the summary-stream port. */
function isStreamStart(msg: unknown): msg is StreamStart {
  if (typeof msg !== 'object' || msg === null) return false;
  const m = msg as Record<string, unknown>;
  return (
    m.type === 'stream/start' &&
    typeof m.clusterId === 'string' &&
    (m.summaryType === 'short' || m.summaryType === 'detailed' || m.summaryType === 'keyfacts')
  );
}

function post(port: chrome.runtime.Port, evt: StreamEvent): void {
  try {
    port.postMessage(evt);
  } catch {
    /* port already closed; drop */
  }
}

async function runStream(
  port: chrome.runtime.Port,
  start: StreamStart,
  signal: AbortSignal,
): Promise<void> {
  const cluster = await resolveCluster(start.clusterId, start.cluster);
  if (signal.aborted) return;
  if (!cluster) {
    post(port, {
      type: 'error',
      error: appError('INTERNAL', 'That story is no longer available. Refresh the feed.'),
    });
    return;
  }
  const provider = await getProvider();
  if (signal.aborted) return;
  if (!provider) {
    post(port, { type: 'error', error: appError('NO_KEY', 'Add an API key to use AI features.') });
    return;
  }

  const res = await generateSummary(
    cluster,
    start.summaryType,
    provider,
    (text) => {
      post(port, { type: 'delta', section: 'whatHappened', text });
    },
    signal,
  );
  // The user disconnected mid-flight: don't post to a dead port and don't treat
  // the abort as a user-facing error.
  if (signal.aborted) return;
  if (res.ok) post(port, { type: 'done', summary: res.value });
  else post(port, { type: 'error', error: res.error });
}

/** Wire a freshly connected summary-stream port to the generation pipeline. */
export function attachStreamPort(port: chrome.runtime.Port): void {
  // One controller per port: aborts the upstream fetch when the panel
  // disconnects (Stop button / panel close) so we don't keep streaming to a
  // dead port or bill the user for an abandoned request.
  const controller = new AbortController();
  port.onDisconnect.addListener(() => controller.abort());

  // One stream per port. A second stream/start would run concurrently against
  // the same AbortController and interleave delta/done/error to the same port
  // (garbled output + double billing). Ignore re-starts; the panel opens a
  // fresh port per generation.
  let started = false;

  port.onMessage.addListener((msg: unknown) => {
    if (!isStreamStart(msg)) {
      post(port, { type: 'error', error: appError('INTERNAL', 'Invalid stream request.') });
      return;
    }
    if (started) return;
    started = true;
    void runStream(port, msg, controller.signal).catch((e: unknown) => {
      if (controller.signal.aborted) return; // user-initiated; nothing to report
      log.error('stream pipeline crashed', { reason: e instanceof Error ? e.name : 'unknown' });
      post(port, { type: 'error', error: appError('INTERNAL', 'Summary generation failed.') });
    });
  });
}
