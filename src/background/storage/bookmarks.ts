import type { Folder, SavedItem } from '../../shared/contracts';
import { stableHash } from '../hash';
import { local, readRaw, withSerializedWrite, writeRaw } from './area';
import { folderSchema, savedItemSchema } from './schemas';
import { z } from 'zod';

const FOLDERS_KEY = '__signalx_folders_v1';
const ITEMS_KEY = '__signalx_saved_v1';
// All bookmark mutations share one serialization lock: removeFolder touches
// both keys, so a per-key chain would still let saveItem interleave with a
// folder delete and resurrect just-removed items.
const BOOKMARKS_LOCK = '__signalx_bookmarks_lock';

const foldersArr = z.array(folderSchema);
const itemsArr = z.array(savedItemSchema);

async function readFolders(): Promise<Folder[]> {
  const raw = await readRaw(local(), FOLDERS_KEY);
  if (raw === undefined) return [];
  const parsed = foldersArr.safeParse(raw);
  return parsed.success ? [...parsed.data] : [];
}

async function readItems(): Promise<SavedItem[]> {
  const raw = await readRaw(local(), ITEMS_KEY);
  if (raw === undefined) return [];
  const parsed = itemsArr.safeParse(raw);
  return parsed.success ? (parsed.data as SavedItem[]) : [];
}

export async function listFolders(): Promise<readonly Folder[]> {
  return readFolders();
}

/** Create a folder (idempotent by case-insensitive name). */
export async function createFolder(name: string): Promise<Folder> {
  const trimmed = name.trim();
  return withSerializedWrite(BOOKMARKS_LOCK, async () => {
    const folders = await readFolders();
    const existing = folders.find((f) => f.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) return existing;
    const folder: Folder = { id: `f_${stableHash(`${trimmed}:${Date.now()}`)}`, name: trimmed };
    folders.push(folder);
    await writeRaw(local(), FOLDERS_KEY, folders);
    return folder;
  });
}

/** Save an item, replacing any prior entry with the same id (upsert). */
export async function saveItem(item: SavedItem): Promise<void> {
  const parsed = savedItemSchema.parse(item) as SavedItem;
  await withSerializedWrite(BOOKMARKS_LOCK, async () => {
    const items = await readItems();
    const next = items.filter((i) => i.id !== parsed.id);
    next.push(parsed);
    await writeRaw(local(), ITEMS_KEY, next);
  });
}

export async function listItems(folderId?: string): Promise<readonly SavedItem[]> {
  const items = await readItems();
  const filtered = folderId ? items.filter((i) => i.folderId === folderId) : items;
  return [...filtered].sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt));
}

export async function removeItem(id: string): Promise<void> {
  await withSerializedWrite(BOOKMARKS_LOCK, async () => {
    const items = await readItems();
    await writeRaw(local(), ITEMS_KEY, items.filter((i) => i.id !== id));
  });
}

/** Delete a folder AND every item saved in it. */
export async function removeFolder(folderId: string): Promise<void> {
  await withSerializedWrite(BOOKMARKS_LOCK, async () => {
    // Sequential, not Promise.all: remove the items first, then the folder. If
    // the items write fails the folder survives (no orphaned items, safe to
    // retry); the reverse leaves only an empty folder (also harmless).
    const items = await readItems();
    await writeRaw(local(), ITEMS_KEY, items.filter((i) => i.folderId !== folderId));
    const folders = await readFolders();
    await writeRaw(local(), FOLDERS_KEY, folders.filter((f) => f.id !== folderId));
  });
}
