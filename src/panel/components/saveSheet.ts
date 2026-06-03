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

  // Open straight into "new folder" mode when no folders exist yet.
  let selectedId: string | undefined = folders[0]?.id;
  let creating = folders.length === 0;
  let pendingName = '';
  let errorMsg = '';

  /** Create the typed folder (if any), then save — one tap, no hidden Enter step. */
  const onSave = async (): Promise<void> => {
    errorMsg = '';
    let folderId = selectedId;
    const trimmed = pendingName.trim();
    if (creating && trimmed) {
      const res = await send({ type: 'bookmarks/createFolder', name: trimmed });
      if (!res.ok) {
        errorMsg = res.error.message;
        draw();
        return;
      }
      folders.push(res.value);
      folderId = res.value.id;
      selectedId = folderId;
      creating = false;
      pendingName = '';
    }
    if (!folderId) {
      errorMsg = 'Pick a folder or type a new folder name first.';
      draw();
      return;
    }
    const saved = await send({ type: 'bookmarks/save', item: buildItem(folderId) });
    if (!saved.ok) {
      errorMsg = saved.error.message;
      draw();
      return;
    }
    handle.close();
  };

  function draw(): void {
    const rows: HTMLElement[] = folders.map((f) =>
      optRow(f.name, f.id === selectedId && !pendingName.trim(), () => {
        selectedId = f.id;
        creating = false;
        pendingName = '';
        draw();
      }, 'folder'),
    );

    const newFolderControl = creating
      ? el('input', {
          class: 'input',
          placeholder: 'New folder name',
          value: pendingName,
          'aria-label': 'New folder name',
          onInput: (e) => {
            pendingName = (e.currentTarget as HTMLInputElement).value;
            saveBtn.textContent = saveLabel();
          },
          onKeyDown: (e) => {
            if (e.key === 'Enter') void onSave();
          },
        })
      : el('button', { class: 'new-folder', onClick: () => { creating = true; draw(); } }, [icon('plus', 16), el('span', {}, ['New folder'])]);

    const saveLabel = (): string => (creating && pendingName.trim() ? 'Create folder & save' : 'Save');
    const saveBtn = el('button', {
      class: 'act-btn primary',
      style: 'display:block; width:100%; margin-top:10px; padding:11px 0;',
      onClick: () => void onSave(),
    }, [saveLabel()]);

    render(
      bodyHost,
      ...rows,
      newFolderControl,
      errorMsg ? el('div', { class: 'key-status bad', role: 'alert' }, [errorMsg]) : null,
      saveBtn,
    );
    if (creating && !pendingName) bodyHost.querySelector('input')?.focus();
  }

  draw();
}
