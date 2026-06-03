import type { StreamEvent, StreamStart } from '../shared/contracts';
import { appError } from './result';
import { getClusterById } from './feeds/cache';
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

async function runStream(port: chrome.runtime.Port, start: StreamStart): Promise<void> {
  const cluster = await getClusterById(start.clusterId);
  if (!cluster) {
    post(port, {
      type: 'error',
      error: appError('INTERNAL', 'That story is no longer available. Refresh the feed.'),
    });
    return;
  }
  const provider = await getProvider();
  if (!provider) {
    post(port, { type: 'error', error: appError('NO_KEY', 'Add an API key to use AI features.') });
    return;
  }

  const res = await generateSummary(cluster, start.summaryType, provider, (text) => {
    post(port, { type: 'delta', section: 'whatHappened', text });
  });
  if (res.ok) post(port, { type: 'done', summary: res.value });
  else post(port, { type: 'error', error: res.error });
}

/** Wire a freshly connected summary-stream port to the generation pipeline. */
export function attachStreamPort(port: chrome.runtime.Port): void {
  port.onMessage.addListener((msg: unknown) => {
    if (!isStreamStart(msg)) {
      post(port, { type: 'error', error: appError('INTERNAL', 'Invalid stream request.') });
      return;
    }
    void runStream(port, msg).catch((e: unknown) => {
      log.error('stream pipeline crashed', { reason: e instanceof Error ? e.name : 'unknown' });
      post(port, { type: 'error', error: appError('INTERNAL', 'Summary generation failed.') });
    });
  });
}
