/**
 * Tiny structured logger. No-ops in production builds so service-worker logs
 * stay clean. Never pass API keys or raw provider payloads through this.
 */

const isDev = (() => {
  try {
    // import.meta.env.DEV is injected by Vite; falls back to false otherwise.
    return Boolean((import.meta as { env?: { DEV?: boolean } }).env?.DEV);
  } catch {
    return false;
  }
})();

type Fields = Readonly<Record<string, unknown>>;

function emit(level: 'info' | 'warn' | 'error', msg: string, fields?: Fields): void {
  if (!isDev) return;
  const entry = { ts: new Date().toISOString(), level, msg, ...fields };
  // eslint-disable-next-line no-console
  (level === 'error' ? console.error : level === 'warn' ? console.warn : console.info)(
    JSON.stringify(entry),
  );
}

export const log = {
  info: (msg: string, fields?: Fields): void => emit('info', msg, fields),
  warn: (msg: string, fields?: Fields): void => emit('warn', msg, fields),
  error: (msg: string, fields?: Fields): void => emit('error', msg, fields),
};
