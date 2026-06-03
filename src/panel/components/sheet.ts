/**
 * Reusable bottom sheet: scrim, grab handle, title, arbitrary body.
 * Accessibility: role=dialog + aria-modal, Escape closes, clicking the scrim
 * closes, focus moves into the sheet on open and is restored on close.
 */

import { el } from '../lib/dom';

export interface SheetHandle {
  readonly close: () => void;
}

export function openSheet(title: string, body: readonly HTMLElement[]): SheetHandle {
  const app = document.getElementById('app');
  if (!app) return { close: () => undefined };

  const previouslyFocused = document.activeElement;

  const sheet = el('div', { class: 'sheet', role: 'dialog', 'aria-label': title }, [
    el('div', { class: 'grab' }),
    el('h3', {}, [title]),
    ...body,
  ]);
  // aria-modal is not in our typed attr set; set directly.
  sheet.setAttribute('aria-modal', 'true');

  const scrim = el('div', { class: 'sheet-scrim' }, [sheet]);

  const close = (): void => {
    document.removeEventListener('keydown', onKey, true);
    scrim.remove();
    if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
  };

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  };

  scrim.addEventListener('click', (e) => {
    if (e.target === scrim) close();
  });
  document.addEventListener('keydown', onKey, true);

  app.appendChild(scrim);
  const firstFocusable = sheet.querySelector<HTMLElement>('button, [tabindex], input, select');
  firstFocusable?.focus();

  return { close };
}

/** A selectable option row for sheets (country / folder pickers). */
export function optRow(
  label: string,
  selected: boolean,
  onClick: () => void,
): HTMLButtonElement {
  return el('button', { class: selected ? 'opt-row sel' : 'opt-row', 'aria-selected': selected, onClick }, [
    label,
    selected ? el('span', { class: 'check' }, ['✓']) : null,
  ]);
}
