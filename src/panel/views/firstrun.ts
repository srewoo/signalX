/**
 * First run (prototype screen 14). Shown when no provider is configured and the
 * user hasn't skipped this session. "Add your AI key" opens Settings; "Skip" persists
 * a session flag so feeds/search load keyless.
 */

import { el, render } from '../lib/dom';
import { icon } from '../lib/icons';
import { topbar } from '../components/chrome';
import { pageFooter } from '../components/footer';
import { navigate } from '../router';

const SKIP_KEY = 'signalx-skip-onboarding';

export function hasSkippedOnboarding(): boolean {
  try {
    return sessionStorage.getItem(SKIP_KEY) === '1';
  } catch {
    return false;
  }
}

function markSkipped(): void {
  try {
    sessionStorage.setItem(SKIP_KEY, '1');
  } catch {
    // sessionStorage unavailable — fall through; user simply sees first run again.
  }
}

export function renderFirstRun(root: HTMLElement): void {
  const content = el('div', { class: 'content centered' }, [
    el('div', { class: 'firstrun-mark' }, [icon('sparkles', 30)]),
    el('h3', { class: 'firstrun-h' }, ['News, distilled.']),
    el('p', { class: 'firstrun-p' }, [
      'Headlines and search are free — no account, no key. Add your own AI key to unlock summaries and source comparison.',
    ]),
    el('button', { class: 'act-btn primary firstrun-btn', onClick: () => navigate({ view: 'settings' }) }, ['Add your AI key']),
    el('button', { class: 'act-btn borderless firstrun-btn', onClick: () => { markSkipped(); navigate({ view: 'feed' }); } }, ['Skip — browse without AI']),
    pageFooter(),
  ]);
  render(root, topbar('SignalX', null), content);
}
