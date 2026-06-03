import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  mapHttpError,
  mapThrownError,
  retryBudget,
  backoffMs,
  MAX_RATE_LIMIT_RETRIES,
  MAX_TRANSIENT_RETRIES,
} from '../../src/background/llm/errors';
import type { AppError } from '../../src/shared/contracts';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('mapHttpError', () => {
  it('should map 429 to RATE_LIMITED with numeric Retry-After when present', () => {
    const e = mapHttpError(429, '', '30');
    expect(e.code).toBe('RATE_LIMITED');
    expect(e.retryAfterSec).toBe(30);
  });

  it('should cap Retry-After at 120 seconds when given a large value', () => {
    expect(mapHttpError(429, '', '9999').retryAfterSec).toBe(120);
  });

  it('should parse an HTTP-date Retry-After into seconds when given a date', () => {
    const future = new Date(Date.now() + 20_000).toUTCString();
    const e = mapHttpError(429, '', future);
    expect(e.code).toBe('RATE_LIMITED');
    expect(e.retryAfterSec).toBeGreaterThan(0);
    expect(e.retryAfterSec).toBeLessThanOrEqual(120);
  });

  it('should omit retryAfterSec when Retry-After is absent on a 429', () => {
    expect(mapHttpError(429, '', null).retryAfterSec).toBeUndefined();
  });

  it('should map 401 to INVALID_KEY', () => {
    expect(mapHttpError(401, '', null).code).toBe('INVALID_KEY');
  });

  it('should map 403 to INVALID_KEY', () => {
    expect(mapHttpError(403, '', null).code).toBe('INVALID_KEY');
  });

  it('should map 402 to BILLING', () => {
    expect(mapHttpError(402, '', null).code).toBe('BILLING');
  });

  it('should map billing-hint bodies to BILLING even on other status codes', () => {
    expect(mapHttpError(400, 'insufficient_quota for this org', null).code).toBe('BILLING');
    expect(mapHttpError(400, 'please add a payment method', null).code).toBe('BILLING');
  });

  it('should map 5xx to PROVIDER_ERROR', () => {
    expect(mapHttpError(500, '', null).code).toBe('PROVIDER_ERROR');
    expect(mapHttpError(503, '', null).code).toBe('PROVIDER_ERROR');
  });

  it('should map an unclassified 4xx to PROVIDER_ERROR with the status in the message', () => {
    const e = mapHttpError(418, '', null);
    expect(e.code).toBe('PROVIDER_ERROR');
    expect(e.message).toContain('418');
  });

  it('should never leak the raw provider body into the message', () => {
    const secret = 'sk-secretkey-and-stacktrace';
    const e = mapHttpError(500, secret, null);
    expect(e.message).not.toContain(secret);
  });
});

describe('mapThrownError', () => {
  it('should map an AbortError DOMException to TIMEOUT', () => {
    const e = mapThrownError(new DOMException('aborted', 'AbortError'));
    expect(e.code).toBe('TIMEOUT');
  });

  it('should map a TypeError to OFFLINE', () => {
    expect(mapThrownError(new TypeError('failed to fetch')).code).toBe('OFFLINE');
  });

  it('should map an unknown error to PROVIDER_ERROR', () => {
    expect(mapThrownError(new Error('boom')).code).toBe('PROVIDER_ERROR');
    expect(mapThrownError('string error').code).toBe('PROVIDER_ERROR');
  });
});

describe('retryBudget', () => {
  const e = (code: AppError['code']): AppError => ({ code, message: '' });

  it('should grant the rate-limit budget when given RATE_LIMITED', () => {
    expect(retryBudget(e('RATE_LIMITED'))).toBe(MAX_RATE_LIMIT_RETRIES);
  });

  it('should grant the transient budget when given TIMEOUT or PROVIDER_ERROR', () => {
    expect(retryBudget(e('TIMEOUT'))).toBe(MAX_TRANSIENT_RETRIES);
    expect(retryBudget(e('PROVIDER_ERROR'))).toBe(MAX_TRANSIENT_RETRIES);
  });

  it('should grant no budget when given non-retryable codes', () => {
    expect(retryBudget(e('INVALID_KEY'))).toBe(0);
    expect(retryBudget(e('BILLING'))).toBe(0);
    expect(retryBudget(e('OFFLINE'))).toBe(0);
    expect(retryBudget(e('NO_KEY'))).toBe(0);
  });
});

describe('backoffMs', () => {
  it('should honor Retry-After exactly when provided', () => {
    expect(backoffMs(0, 30)).toBe(30_000);
    expect(backoffMs(2, 5)).toBe(5_000);
  });

  it('should grow exponentially with attempt when no Retry-After is given', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // remove jitter
    expect(backoffMs(0)).toBe(800);
    expect(backoffMs(1)).toBe(1600);
    expect(backoffMs(2)).toBe(3200);
  });

  it('should keep jitter within the base-backoff bound when no Retry-After', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999999);
    const v = backoffMs(0);
    // exp (800) + jitter (< 800)
    expect(v).toBeGreaterThanOrEqual(800);
    expect(v).toBeLessThan(800 + 800);
  });
});

describe('extractProviderMessage', () => {
  it('should extract OpenAI-style error messages when body is JSON', async () => {
    const { extractProviderMessage } = await import('../../src/background/llm/errors');
    expect(extractProviderMessage('{"error":{"message":"Unsupported parameter: max_tokens","type":"invalid_request_error"}}'))
      .toBe('Unsupported parameter: max_tokens');
  });

  it('should extract Gemini-style nested messages when wrapped in error object', async () => {
    const { extractProviderMessage } = await import('../../src/background/llm/errors');
    expect(extractProviderMessage('{"error":{"code":400,"message":"models/foo is not found","status":"NOT_FOUND"}}'))
      .toBe('models/foo is not found');
  });

  it('should return undefined when body is not JSON', async () => {
    const { extractProviderMessage } = await import('../../src/background/llm/errors');
    expect(extractProviderMessage('<html>bad gateway</html>')).toBeUndefined();
  });

  it('should truncate very long messages when over 160 chars', async () => {
    const { extractProviderMessage } = await import('../../src/background/llm/errors');
    const long = JSON.stringify({ error: { message: 'x'.repeat(500) } });
    const out = extractProviderMessage(long);
    expect(out).toHaveLength(160);
    expect(out?.endsWith('…')).toBe(true);
  });
});
