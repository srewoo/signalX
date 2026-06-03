import { vi } from 'vitest';

/**
 * Minimal in-memory chrome.storage.local / chrome.storage.session mock.
 * Each area owns an isolated Map. Mirrors the subset of the StorageArea API
 * the background storage modules use: get(key), set(obj), remove(key).
 */

export interface FakeStorageArea {
  readonly store: Map<string, unknown>;
  get(key: string): Promise<Record<string, unknown>>;
  set(obj: Record<string, unknown>): Promise<void>;
  remove(key: string): Promise<void>;
}

function makeArea(): FakeStorageArea {
  const store = new Map<string, unknown>();
  return {
    store,
    get: vi.fn(async (key: string) => {
      const out: Record<string, unknown> = {};
      if (store.has(key)) out[key] = store.get(key);
      return out;
    }),
    set: vi.fn(async (obj: Record<string, unknown>) => {
      for (const [k, v] of Object.entries(obj)) store.set(k, v);
    }),
    remove: vi.fn(async (key: string) => {
      store.delete(key);
    }),
  };
}

export interface FakeChrome {
  storage: {
    local: FakeStorageArea;
    session: FakeStorageArea;
  };
}

/** Build a fresh fake chrome global and install it via vi.stubGlobal. */
export function installChromeMock(): FakeChrome {
  const fake: FakeChrome = {
    storage: {
      local: makeArea(),
      session: makeArea(),
    },
  };
  vi.stubGlobal('chrome', fake);
  return fake;
}
