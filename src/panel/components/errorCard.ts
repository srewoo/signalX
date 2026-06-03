/**
 * Maps an AppError to the actionable error card from prototype screen 5.
 * Every BYOK / offline failure produces a card with real recovery actions —
 * never a dead end (PRD Feature 5 + NFR resilience).
 */

import { el } from '../lib/dom';
import type { AppError } from '../../shared/contracts';

export interface ErrorActions {
  /** RATE_LIMITED + PROVIDER_ERROR/TIMEOUT/OFFLINE/INTERNAL */
  readonly onRetry?: () => void;
  /** RATE_LIMITED */
  readonly onSwitchModel?: () => void;
  /** INVALID_KEY / NO_KEY */
  readonly onUpdateKey?: () => void;
  readonly onTestKey?: () => void;
  /** BILLING */
  readonly onSwitchProvider?: () => void;
  readonly onOpenBilling?: () => void;
}

interface Spec {
  readonly tone: 'err-red' | 'err-amber';
  readonly title: string;
  readonly body: (e: AppError) => string;
  readonly buttons: (a: ErrorActions) => readonly HTMLButtonElement[];
}

function btn(label: string, handler: (() => void) | undefined, solid: boolean): HTMLButtonElement | null {
  if (!handler) return null;
  return el('button', { class: solid ? 'err-btn solid' : 'err-btn', onClick: handler }, [label]);
}

function compact(...maybe: readonly (HTMLButtonElement | null)[]): readonly HTMLButtonElement[] {
  return maybe.filter((b): b is HTMLButtonElement => b !== null);
}

const SPECS: Record<AppError['code'], Spec> = {
  RATE_LIMITED: {
    tone: 'err-amber',
    title: '⏳ Your AI provider is rate-limiting requests',
    body: (e) =>
      e.retryAfterSec !== undefined
        ? `Returned 429. SignalX will retry automatically in ${e.retryAfterSec}s.`
        : e.message,
    buttons: (a) => compact(btn('Retry now', a.onRetry, false), btn('Switch model', a.onSwitchModel, true)),
  },
  INVALID_KEY: {
    tone: 'err-red',
    title: '🔑 API key rejected (401)',
    body: (e) => e.message,
    buttons: (a) => compact(btn('Update key', a.onUpdateKey, false), btn('Test key', a.onTestKey, true)),
  },
  NO_KEY: {
    tone: 'err-amber',
    title: '✦ Add an AI key to use this',
    body: (e) => e.message,
    buttons: (a) => compact(btn('Add key', a.onUpdateKey, false)),
  },
  BILLING: {
    tone: 'err-red',
    title: '💳 Provider account out of credits',
    body: (e) => e.message,
    buttons: (a) => compact(btn('Switch provider', a.onSwitchProvider, false), btn('Open billing ↗', a.onOpenBilling, true)),
  },
  OFFLINE: {
    tone: 'err-amber',
    title: "📡 Can't reach news sources",
    body: (e) => e.message,
    buttons: (a) => compact(btn('Retry', a.onRetry, false)),
  },
  FEED_UNAVAILABLE: {
    tone: 'err-amber',
    title: "📡 Can't reach news sources",
    body: (e) => e.message,
    buttons: (a) => compact(btn('Retry', a.onRetry, false)),
  },
  TIMEOUT: {
    tone: 'err-amber',
    title: '⏱ Request timed out',
    body: (e) => e.message,
    buttons: (a) => compact(btn('Retry', a.onRetry, false)),
  },
  PROVIDER_ERROR: {
    tone: 'err-red',
    title: '⚠ AI provider error',
    body: (e) => e.message,
    buttons: (a) => compact(btn('Retry', a.onRetry, false)),
  },
  INTERNAL: {
    tone: 'err-red',
    title: '⚠ Something went wrong',
    body: (e) => e.message,
    buttons: (a) => compact(btn('Retry', a.onRetry, false)),
  },
};

export function errorCard(error: AppError, actions: ErrorActions = {}): HTMLElement {
  const spec = SPECS[error.code];
  const buttons = spec.buttons(actions);
  return el('div', { class: `err-card ${spec.tone}`, role: 'alert' }, [
    el('div', { class: 'e-title' }, [spec.title]),
    spec.body(error),
    buttons.length > 0 ? el('div', { class: 'err-actions' }, buttons) : null,
  ]);
}
