/** Promise wrappers around chrome.storage areas. Reads are validated by callers. */

type Area = chrome.storage.StorageArea;

export async function readRaw(area: Area, key: string): Promise<unknown> {
  const obj = await area.get(key);
  return obj[key];
}

export async function writeRaw(area: Area, key: string, value: unknown): Promise<void> {
  await area.set({ [key]: value });
}

export async function removeKey(area: Area, key: string): Promise<void> {
  await area.remove(key);
}

export const local = (): Area => chrome.storage.local;
export const session = (): Area => chrome.storage.session;

// Read-modify-write on chrome.storage is not atomic: two concurrent callers
// read the same prior value, mutate independently, and the last write wins
// (lost update). The panel routinely fires writes in parallel (save + create
// folder, two thumbs, two overviews completing together). Serialize each
// logical key through an in-memory promise chain so every read-modify-write
// runs to completion before the next begins. Caveat: this only serializes
// within one service-worker lifetime — two writes straddling an SW restart are
// not ordered, which matches the guarantee the cluster index already relies on.
const writeChains = new Map<string, Promise<unknown>>();

export function withSerializedWrite<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prior = writeChains.get(key) ?? Promise.resolve();
  const run = prior.then(fn, fn);
  // Keep the chain alive even if this link rejects, so a failed write doesn't
  // wedge later callers; the returned promise still surfaces this call's error.
  writeChains.set(
    key,
    run.catch(() => undefined),
  );
  return run;
}
