import type { Folder, SavedItem } from '../../shared/contracts';
import { stableHash } from '../hash';
import { local, readRaw, writeRaw } from './area';
import { folderSchema, savedItemSchema } from './schemas';
import { z } from 'zod';

const FOLDERS_KEY = '__signalx_folders_v1';
const ITEMS_KEY = '__signalx_saved_v1';

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
  const folders = await readFolders();
  const existing = folders.find((f) => f.name.toLowerCase() === trimmed.toLowerCase());
  if (existing) return existing;
  const folder: Folder = { id: `f_${stableHash(`${trimmed}:${Date.now()}`)}`, name: trimmed };
  folders.push(folder);
  await writeRaw(local(), FOLDERS_KEY, folders);
  return folder;
}

/** Save an item, replacing any prior entry with the same id (upsert). */
export async function saveItem(item: SavedItem): Promise<void> {
  const parsed = savedItemSchema.parse(item) as SavedItem;
  const items = await readItems();
  const next = items.filter((i) => i.id !== parsed.id);
  next.push(parsed);
  await writeRaw(local(), ITEMS_KEY, next);
}

export async function listItems(folderId?: string): Promise<readonly SavedItem[]> {
  const items = await readItems();
  const filtered = folderId ? items.filter((i) => i.folderId === folderId) : items;
  return [...filtered].sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt));
}

export async function removeItem(id: string): Promise<void> {
  const items = await readItems();
  await writeRaw(local(), ITEMS_KEY, items.filter((i) => i.id !== id));
}

/** Delete a folder AND every item saved in it. */
export async function removeFolder(folderId: string): Promise<void> {
  const [folders, items] = await Promise.all([readFolders(), readItems()]);
  await Promise.all([
    writeRaw(local(), FOLDERS_KEY, folders.filter((f) => f.id !== folderId)),
    writeRaw(local(), ITEMS_KEY, items.filter((i) => i.folderId !== folderId)),
  ]);
}
