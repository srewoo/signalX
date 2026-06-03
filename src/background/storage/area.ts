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
