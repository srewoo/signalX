/**
 * Save-to-folder bottom sheet (prototype screen 9). Lists existing folders,
 * supports inline "New folder" creation, then persists a SavedItem.
 */

import { el, render } from '../lib/dom';
import { icon } from '../lib/icons';
import { openSheet, optRow } from './sheet';
import { send } from '../lib/messaging';
import type { Folder, SavedItem } from '../../shared/contracts';

/**
 * Open the save sheet for a saved item missing its folderId. The caller
 * supplies a factory that stamps the chosen folderId onto the item.
 */
export async function openSaveSheet(buildItem: (folderId: string) => SavedItem): Promise<void> {
  const foldersRes = await send({ type: 'bookmarks/listFolders' });
  const folders: Folder[] = foldersRes.ok ? [...foldersRes.value] : [];

  const bodyHost = el('div', {});
  const handle = openSheet('Save summary to…', [bodyHost]);

  let selectedId: string | undefined = folders[0]?.id;
  let creating = false;

  const onSave = async (): Promise<void> => {
    if (!selectedId) return;
    await send({ type: 'bookmarks/save', item: buildItem(selectedId) });
    handle.close();
  };

  const onCreate = async (name: string): Promise<void> => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const res = await send({ type: 'bookmarks/createFolder', name: trimmed });
    if (res.ok) {
      folders.push(res.value);
      selectedId = res.value.id;
    }
    creating = false;
    draw();
  };

  function draw(): void {
    const rows: HTMLElement[] = folders.map((f) =>
      optRow(f.name, f.id === selectedId, () => {
        selectedId = f.id;
        draw();
      }, 'folder'),
    );

    const newFolderControl = creating
      ? el('input', {
          class: 'input',
          placeholder: 'Folder name',
          onKeyDown: (e) => {
            if (e.key === 'Enter') void onCreate((e.currentTarget as HTMLInputElement).value);
          },
        })
      : el('button', { class: 'new-folder', onClick: () => { creating = true; draw(); } }, [icon('plus', 16), el('span', {}, ['New folder'])]);

    render(
      bodyHost,
      ...rows,
      newFolderControl,
      el('button', { class: 'act-btn primary', style: 'margin-top:8px; padding:11px 0;', disabled: !selectedId, onClick: () => void onSave() }, ['Save']),
    );
    if (creating) bodyHost.querySelector('input')?.focus();
  }

  draw();
}
