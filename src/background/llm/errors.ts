import type { AppError } from '../../shared/contracts';
import { appError } from '../result';

/**
 * Maps provider HTTP failures and fetch exceptions to safe AppError codes, and
 * implements the retry policy. Raw provider payloads are never surfaced to the
 * user — only a fixed safe message per code.
 */

const BILLING_HINTS = [
  'insufficient_quota',
  'billing',
  'credit',
  'payment',
  'exceeded your current quota',
];

function parseRetryAfter(headerVal: string | null): number | undefined {
  if (!headerVal) return undefined;
  const asNum = Number(headerVal);
  if (Number.isFinite(asNum) && asNum >= 0) return Math.min(asNum, 120);
  const asDate = Date.parse(headerVal);
  if (!Number.isNaN(asDate)) {
    const secs = Math.ceil((asDate - Date.now()) / 1000);
    return secs > 0 ? Math.min(secs, 120) : undefined;
  }
  return undefined;
}

/** Map a non-2xx Response (+ its already-read body text) to an AppError. */
export function mapHttpError(status: number, bodyText: string, retryAfter: string | null): AppError {
  const lower = bodyText.toLowerCase();
  if (status === 429) {
    return appError('RATE_LIMITED', 'Rate limited by the provider. Retrying…', parseRetryAfter(retryAfter));
  }
  if (status === 401 || status === 403) {
    return appError('INVALID_KEY', 'Your API key was rejected. Update or test your key.');
  }
  if (status === 402 || BILLING_HINTS.some((h) => lower.includes(h))) {
    return appError('BILLING', 'Your provider reports no available credits. Switch provider or top up.');
  }
  if (status >= 500) {
    return appError('PROVIDER_ERROR', 'The AI provider had a server error. Please retry.');
  }
  const hint = extractProviderMessage(bodyText);
  return appError(
    'PROVIDER_ERROR',
    hint
      ? `The AI provider returned an error (${status}): ${hint}`
      : `The AI provider returned an error (${status}).`,
  );
}

/**
 * Pull the human-readable message out of a provider error body so 4xx failures
 * are actionable (e.g. "model not found", "max_tokens not supported").
 * Sanitized: JSON-parsed message fields only (never raw bodies), de-quoted,
 * whitespace-collapsed, hard-truncated. API keys never appear in these fields.
 */
export function extractProviderMessage(bodyText: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(bodyText);
    const msg = findMessage(parsed, 0);
    if (!msg) return undefined;
    const clean = msg.replace(/\s+/g, ' ').trim();
    return clean.length > 160 ? `${clean.slice(0, 157)}…` : clean;
  } catch {
    return undefined;
  }
}

/** Depth-limited search for a `message` string in a provider error payload. */
function findMessage(value: unknown, depth: number): string | undefined {
  if (depth > 3 || value === null || typeof value !== 'object') return undefined;
  const obj = value as Record<string, unknown>;
  if (typeof obj['message'] === 'string' && obj['message'].length > 0) return obj['message'];
  for (const key of ['error', 'errors', 'detail']) {
    const nested = obj[key];
    if (Array.isArray(nested)) {
      for (const item of nested) {
        const found = findMessage(item, depth + 1);
        if (found) return found;
      }
    } else {
      const found = findMessage(nested, depth + 1);
      if (found) return found;
    }
  }
  return undefined;
}

/** Map a thrown fetch exception (abort/network) to an AppError. */
export function mapThrownError(e: unknown): AppError {
  if (e instanceof DOMException && e.name === 'AbortError') {
    return appError('TIMEOUT', 'The AI request timed out. Please retry.');
  }
  if (e instanceof TypeError) {
    return appError('OFFLINE', 'Could not reach the AI provider. Check your connection.');
  }
  return appError('PROVIDER_ERROR', 'Unexpected error talking to the AI provider.');
}

export const MAX_RATE_LIMIT_RETRIES = 3;
export const MAX_TRANSIENT_RETRIES = 1;
const BASE_BACKOFF_MS = 800;

/** Whether an error is worth retrying, and the count budget for its category. */
export function retryBudget(error: AppError): number {
  switch (error.code) {
    case 'RATE_LIMITED':
      return MAX_RATE_LIMIT_RETRIES;
    case 'TIMEOUT':
    case 'PROVIDER_ERROR':
      return MAX_TRANSIENT_RETRIES;
    default:
      return 0; // INVALID_KEY, BILLING, OFFLINE, etc. — no retry
  }
}

/** Backoff delay in ms for a given attempt, honoring Retry-After with jitter. */
export function backoffMs(attempt: number, retryAfterSec?: number): number {
  if (retryAfterSec !== undefined) return retryAfterSec * 1000;
  const exp = BASE_BACKOFF_MS * 2 ** attempt;
  const jitter = Math.random() * BASE_BACKOFF_MS;
  return exp + jitter;
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
