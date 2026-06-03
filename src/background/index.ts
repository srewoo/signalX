import { STREAM_PORT } from '../shared/contracts';
import type { Result } from '../shared/contracts';
import { internal } from './result';
import { requestSchema } from './requestSchema';
import { route } from './router';
import { attachStreamPort } from './stream';
import { log } from './logger';

const PANEL_PATH = 'src/panel/panel.html';

// The manifest's side_panel.default_path registers the panel resource but would
// otherwise auto-enable it on every tab. Disable it globally on install so the
// panel only ever appears on tabs where the user explicitly opened it.
chrome.runtime.onInstalled.addListener(() => {
  void (async () => {
    try {
      await chrome.sidePanel.setOptions({ enabled: false });
    } catch (e) {
      log.error('failed to disable global side panel', {
        reason: e instanceof Error ? e.name : 'unknown',
      });
    }
  })();
});

// Open the side panel for the clicked tab only (per-tab, never global).
// IMPORTANT: sidePanel.open() must run synchronously inside the user-gesture
// context — awaiting setOptions() first crosses a microtask boundary, drops the
// gesture token, and open() rejects silently. Issue both calls without awaiting
// in between; Chrome processes them in order.
chrome.action.onClicked.addListener((tab) => {
  if (tab.id === undefined) return;
  const tabId = tab.id;
  void chrome.sidePanel
    .setOptions({ tabId, path: PANEL_PATH, enabled: true })
    .catch((e: unknown) => {
      log.error('setOptions failed', { reason: e instanceof Error ? e.name : 'unknown' });
    });
  chrome.sidePanel.open({ tabId }).catch((e: unknown) => {
    log.error('failed to open side panel', { reason: e instanceof Error ? e.name : 'unknown' });
  });
});

// Typed request router. Always responds with a Result<T>; never throws across
// the boundary. Returns true to keep the message channel open for the async reply.
chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  void (async () => {
    const parsed = requestSchema.safeParse(message);
    if (!parsed.success) {
      const res: Result<never> = { ok: false, error: internal('Malformed request.') };
      sendResponse(res);
      return;
    }
    try {
      const result = await route(parsed.data);
      sendResponse(result);
    } catch (e) {
      log.error('handler crashed', {
        type: parsed.data.type,
        reason: e instanceof Error ? e.name : 'unknown',
      });
      const res: Result<never> = { ok: false, error: internal() };
      sendResponse(res);
    }
  })();
  return true;
});

// Streaming summaries over a dedicated port.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== STREAM_PORT) return;
  attachStreamPort(port);
});
