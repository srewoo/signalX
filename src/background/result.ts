import type { AppError, AppErrorCode, Result } from '../shared/contracts';

/** Helpers for building Result<T> values and AppErrors at the message boundary. */

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function err<T>(error: AppError): Result<T> {
  return { ok: false, error };
}

export function appError(
  code: AppErrorCode,
  message: string,
  retryAfterSec?: number,
): AppError {
  return retryAfterSec === undefined ? { code, message } : { code, message, retryAfterSec };
}

/** Wrap an unknown thrown value into a safe INTERNAL AppError. */
export function internal(message = 'Something went wrong. Please try again.'): AppError {
  return { code: 'INTERNAL', message };
}
