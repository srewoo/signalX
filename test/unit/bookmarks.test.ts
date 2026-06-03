import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { installChromeMock } from '../helpers/chromeMock';
import type { SavedItem, Article, Summary } from '../../src/shared/contracts';

beforeEach(() => {
  vi.resetModules();
  installChromeMock();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function load() {
  return import('../../src/background/storage/bookmarks');
}

const article: Article = {
  id: 'art1',
  title: 'Title',
  url: 'https://example.com/a',
  sourceId: 'src',
  sourceName: 'Source',
  publishedAt: '2026-06-03T10:00:00.000Z',
};

const summary: Summary = {
  clusterId: 'c1',
  type: 'short',
  sections: { whatHappened: 'x', keyEvents: [], importantQuotes: [], whatHappensNext: '' },
  model: 'gpt-4o-mini',
  latencyMs: 100,
  estCostUsd: 0.0001,
  cached: false,
  generatedAt: '2026-06-03T10:00:00.000Z',
};

function savedArticle(id: string, folderId: string, savedAt: string): SavedItem {
  return { kind: 'article', id, folderId, savedAt, article };
}

describe('listFolders / createFolder', () => {
  it('should return an empty list when no folders exist', async () => {
    const { listFolders } = await load();
    expect(await listFolders()).toEqual([]);
  });

  it('should create a folder with a trimmed name when given padded input', async () => {
    const { createFolder, listFolders } = await load();
    const f = await createFolder('  Reading List  ');
    expect(f.name).toBe('Reading List');
    expect(await listFolders()).toHaveLength(1);
  });

  it('should be idempotent by case-insensitive name when creating duplicates', async () => {
    const { createFolder, listFolders } = await load();
    const a = await createFolder('Tech');
    const b = await createFolder('tech');
    expect(b.id).toBe(a.id);
    expect(await listFolders()).toHaveLength(1);
  });

  it('should create distinct folders for distinct names', async () => {
    const { createFolder, listFolders } = await load();
    await createFolder('Tech');
    await createFolder('Sports');
    expect(await listFolders()).toHaveLength(2);
  });
});

describe('saveItem / listItems / removeItem', () => {
  it('should save and list an item when given a valid SavedItem', async () => {
    const { saveItem, listItems } = await load();
    await saveItem(savedArticle('s1', 'f1', '2026-06-03T10:00:00.000Z'));
    const items = await listItems();
    expect(items).toHaveLength(1);
    expect(items[0]!.id).toBe('s1');
  });

  it('should upsert (replace) an item with the same id when saving twice', async () => {
    const { saveItem, listItems } = await load();
    await saveItem(savedArticle('s1', 'f1', '2026-06-03T10:00:00.000Z'));
    await saveItem(savedArticle('s1', 'f2', '2026-06-03T11:00:00.000Z'));
    const items = await listItems();
    expect(items).toHaveLength(1);
    expect(items[0]!.folderId).toBe('f2');
  });

  it('should save a summary item when given the summary variant', async () => {
    const { saveItem, listItems } = await load();
    const item: SavedItem = { kind: 'summary', id: 'sum1', folderId: 'f1', savedAt: '2026-06-03T10:00:00.000Z', headline: 'H', summary };
    await saveItem(item);
    const items = await listItems();
    expect(items[0]!.kind).toBe('summary');
  });

  it('should filter by folderId when listing with a folder argument', async () => {
    const { saveItem, listItems } = await load();
    await saveItem(savedArticle('s1', 'f1', '2026-06-03T10:00:00.000Z'));
    await saveItem(savedArticle('s2', 'f2', '2026-06-03T10:00:00.000Z'));
    expect(await listItems('f1')).toHaveLength(1);
    expect((await listItems('f1'))[0]!.id).toBe('s1');
  });

  it('should sort items newest-saved first when listing', async () => {
    const { saveItem, listItems } = await load();
    await saveItem(savedArticle('older', 'f1', '2026-06-01T10:00:00.000Z'));
    await saveItem(savedArticle('newer', 'f1', '2026-06-03T10:00:00.000Z'));
    const items = await listItems();
    expect(items[0]!.id).toBe('newer');
  });

  it('should remove an item by id when removing', async () => {
    const { saveItem, listItems, removeItem } = await load();
    await saveItem(savedArticle('s1', 'f1', '2026-06-03T10:00:00.000Z'));
    await removeItem('s1');
    expect(await listItems()).toEqual([]);
  });

  it('should be a no-op when removing a non-existent id', async () => {
    const { saveItem, listItems, removeItem } = await load();
    await saveItem(savedArticle('s1', 'f1', '2026-06-03T10:00:00.000Z'));
    await removeItem('nope');
    expect(await listItems()).toHaveLength(1);
  });

  it('should throw when saving an item that fails schema validation', async () => {
    const { saveItem } = await load();
    const bad = { kind: 'article', id: '', folderId: 'f1', savedAt: 'x', article } as unknown as SavedItem;
    await expect(saveItem(bad)).rejects.toBeDefined();
  });
});
