/**
 * Saved / Bookmarks (prototype screen 13): folders list + recently saved.
 * Summaries carry a sparkles badge; tapping a saved summary reopens it (cached).
 */

import { el, render } from '../lib/dom';
import { icon } from '../lib/icons';
import { topbar } from '../components/chrome';
import { skelCards } from '../components/skeletons';
import { errorCard } from '../components/errorCard';
import { relativeTime } from '../lib/time';
import { send } from '../lib/messaging';
import type { Folder, SavedItem } from '../../shared/contracts';

export function renderSaved(root: HTMLElement): void {
  const content = el('div', { class: 'content' });
  render(root, topbar('Saved', 'saved'), content);
  void load(content);
}

async function load(content: HTMLElement): Promise<void> {
  render(content, skelCards(3));
  const [foldersRes, itemsRes] = await Promise.all([
    send({ type: 'bookmarks/listFolders' }),
    send({ type: 'bookmarks/list' }),
  ]);

  if (!foldersRes.ok) {
    render(content, errorCard(foldersRes.error, { onRetry: () => void load(content) }));
    return;
  }
  if (!itemsRes.ok) {
    render(content, errorCard(itemsRes.error, { onRetry: () => void load(content) }));
    return;
  }

  const folders = foldersRes.value;
  const items = itemsRes.value;

  if (folders.length === 0 && items.length === 0) {
    render(content, el('div', { class: 'empty-state' }, ['Nothing saved yet. Use the bookmark action on a summary or article to save it here.']));
    return;
  }

  render(content, foldersSection(folders, items), recentSection(items));
}

function foldersSection(folders: readonly Folder[], items: readonly SavedItem[]): HTMLElement {
  const count = (id: string): number => items.filter((i) => i.folderId === id).length;
  const rows = folders.map((f) =>
    el('button', { class: 'folder-row', 'aria-label': `Folder ${f.name}, ${count(f.id)} items` }, [
      icon('folder', 18),
      el('span', { class: 'f-name' }, [f.name]),
      el('span', { class: 'f-count' }, [`${count(f.id)} items`]),
      el('span', { class: 'f-chevron' }, [icon('chevron-right', 16)]),
    ]),
  );
  return el('div', {}, [
    el('div', { class: 'section-h' }, ['Folders']),
    rows.length > 0 ? el('div', {}, rows) : el('div', { class: 'hint' }, ['No folders yet.']),
  ]);
}

function recentSection(items: readonly SavedItem[]): HTMLElement {
  const recent = [...items].sort((a, b) => b.savedAt.localeCompare(a.savedAt)).slice(0, 10);
  const cards = recent.map((item) => savedCard(item));
  return el('div', {}, [
    el('div', { class: 'section-h', style: 'margin-top:16px;' }, ['Recently saved']),
    cards.length > 0 ? el('div', {}, cards) : el('div', { class: 'hint' }, ['No recent items.']),
  ]);
}

function savedCard(item: SavedItem): HTMLElement {
  const headline = item.kind === 'summary' ? item.headline : item.article.title;
  const badge = item.kind === 'summary'
    ? el('span', { class: 'src ai-badge' }, [icon('sparkles', 13), el('span', {}, ['AI Summary'])])
    : el('span', { class: 'src' }, [item.article.sourceName]);

  return el('div', { class: 'card' }, [
    el('div', { class: 'meta' }, [badge, el('span', { class: 'dot' }), relativeTime(item.savedAt)]),
    el('h3', {}, [headline]),
  ]);
}
