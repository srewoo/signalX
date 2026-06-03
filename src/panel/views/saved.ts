/**
 * Saved / Bookmarks (prototype screen 13).
 *
 * Root view: folders list + recently saved. Summaries carry a sparkles badge.
 * Tapping a folder drills into a folder view (its items, a back affordance, the
 * folder name as title). Each saved row has an unobtrusive remove (trash) button
 * that calls bookmarks/remove and drops the row from the DOM on success, with a
 * brief inline error on failure.
 */

import { el, render, setText } from '../lib/dom';
import { icon } from '../lib/icons';
import { topbar, backbar } from '../components/chrome';
import { skelCards } from '../components/skeletons';
import { errorCard } from '../components/errorCard';
import { relativeTime } from '../lib/time';
import { send } from '../lib/messaging';
import type { Folder, SavedItem } from '../../shared/contracts';

export function renderSaved(root: HTMLElement): void {
  const content = el('div', { class: 'content' });
  render(root, topbar('Saved', 'saved'), content);
  void loadRoot(root, content);
}

// ───────────────────────── Root (folders + recent) ─────────────────────────

async function loadRoot(root: HTMLElement, content: HTMLElement): Promise<void> {
  render(root, topbar('Saved', 'saved'), content);
  render(content, skelCards(3));

  const [foldersRes, itemsRes] = await Promise.all([
    send({ type: 'bookmarks/listFolders' }),
    send({ type: 'bookmarks/list' }),
  ]);

  if (!foldersRes.ok) {
    render(content, errorCard(foldersRes.error, { onRetry: () => void loadRoot(root, content) }));
    return;
  }
  if (!itemsRes.ok) {
    render(content, errorCard(itemsRes.error, { onRetry: () => void loadRoot(root, content) }));
    return;
  }

  const folders = foldersRes.value;
  const items = itemsRes.value;

  if (folders.length === 0 && items.length === 0) {
    render(content, el('div', { class: 'empty-state' }, ['Nothing saved yet. Use the bookmark action on a summary or article to save it here.']));
    return;
  }

  render(content, foldersSection(root, content, folders, items), recentSection(items));
}

function foldersSection(root: HTMLElement, content: HTMLElement, folders: readonly Folder[], items: readonly SavedItem[]): HTMLElement {
  const count = (id: string): number => items.filter((i) => i.folderId === id).length;
  const rows = folders.map((f) => folderRow(root, content, f, count(f.id)));
  return el('div', {}, [
    el('div', { class: 'section-h' }, ['Folders']),
    rows.length > 0 ? el('div', {}, rows) : el('div', { class: 'hint' }, ['No folders yet.']),
  ]);
}

/**
 * Folder row: open button + hover/focus-revealed delete. Delete swaps the row
 * into an inline confirm (item count spelled out) — destructive actions never
 * fire on a single click.
 */
function folderRow(root: HTMLElement, content: HTMLElement, f: Folder, itemCount: number): HTMLElement {
  const open = el('button', {
    class: 'folder-open',
    'aria-label': `Open folder ${f.name}, ${itemCount} items`,
    onClick: () => void loadFolder(root, content, f),
  }, [
    icon('folder', 18),
    el('span', { class: 'f-name' }, [f.name]),
    el('span', { class: 'f-count' }, [`${itemCount} items`]),
    el('span', { class: 'f-chevron' }, [icon('chevron-right', 16)]),
  ]);

  const del = el('button', {
    class: 'row-remove folder-del',
    'aria-label': `Delete folder ${f.name}`,
    title: 'Delete folder',
    onClick: () => confirmState(),
  }, [icon('trash', 16)]);

  const row = el('div', { class: 'folder-row' }, [open, del]);

  function confirmState(): void {
    const msg = itemCount > 0
      ? `Delete "${f.name}" and its ${itemCount} saved item${itemCount === 1 ? '' : 's'}?`
      : `Delete "${f.name}"?`;
    const onConfirm = async (): Promise<void> => {
      const res = await send({ type: 'bookmarks/removeFolder', folderId: f.id });
      if (res.ok) {
        void loadRoot(root, content); // refresh counts + recent list
        return;
      }
      setText(warn, res.error.message);
    };
    const confirm = el('button', { class: 'act-btn danger', onClick: () => void onConfirm() }, ['Delete']);
    const cancel = el('button', { class: 'act-btn', onClick: () => {
      row.replaceChildren(open, del);
    } }, ['Cancel']);
    const warn = el('span', { class: 'f-name', role: 'alert' }, [msg]);
    row.replaceChildren(warn, confirm, cancel);
    confirm.focus();
  }

  return row;
}

function recentSection(items: readonly SavedItem[]): HTMLElement {
  const recent = [...items].sort((a, b) => b.savedAt.localeCompare(a.savedAt)).slice(0, 10);
  const cards = recent.map((item) => savedCard(item));
  return el('div', {}, [
    el('div', { class: 'section-h', style: 'margin-top:16px;' }, ['Recently saved']),
    cards.length > 0 ? el('div', {}, cards) : el('div', { class: 'hint' }, ['No recent items.']),
  ]);
}

// ───────────────────────── Folder drill-down ─────────────────────────

async function loadFolder(root: HTMLElement, content: HTMLElement, folder: Folder): Promise<void> {
  const bar = backbar('Saved', () => void loadRoot(root, content));
  bar.appendChild(el('div', { class: 'title', style: 'font-size:14px;' }, [folder.name]));
  render(root, bar, content);
  render(content, skelCards(3));

  const res = await send({ type: 'bookmarks/list', folderId: folder.id });
  if (!res.ok) {
    render(content, errorCard(res.error, { onRetry: () => void loadFolder(root, content, folder) }));
    return;
  }

  const items = res.value;
  if (items.length === 0) {
    render(content, el('div', { class: 'empty-state' }, ['Nothing in this folder yet.']));
    return;
  }

  const sorted = [...items].sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  render(content, el('div', {}, sorted.map((item) => savedCard(item))));
}

// ───────────────────────── Saved row + remove ─────────────────────────

function savedCard(item: SavedItem): HTMLElement {
  const headline = item.kind === 'summary' ? item.headline : item.article.title;
  const badge = item.kind === 'summary'
    ? el('span', { class: 'src ai-badge' }, [icon('sparkles', 13), el('span', {}, ['AI Summary'])])
    : el('span', { class: 'src' }, [item.article.sourceName]);

  const errorText = el('span', {}, ['']);
  const error = el('div', { class: 'key-status bad', style: 'display:none; margin-top:8px;', role: 'alert' }, [icon('x', 14), errorText]);

  const onRemove = async (): Promise<void> => {
    remove.disabled = true;
    error.style.display = 'none';
    const res = await send({ type: 'bookmarks/remove', id: item.id });
    if (res.ok) {
      card.remove();
      return;
    }
    remove.disabled = false;
    setText(errorText, res.error.message);
    error.style.display = '';
  };
  const remove = el('button', {
    class: 'row-remove',
    'aria-label': `Remove "${headline}" from saved`,
    title: 'Remove',
    onClick: () => void onRemove(),
  }, [icon('trash', 16)]);

  const card = el('div', { class: 'card saved-card' }, [
    el('div', { class: 'saved-head' }, [
      el('div', { class: 'saved-body' }, [
        el('div', { class: 'meta' }, [badge, el('span', { class: 'dot' }), relativeTime(item.savedAt)]),
        el('h3', {}, [headline]),
      ]),
      remove,
    ]),
    error,
  ]);
  return card;
}
