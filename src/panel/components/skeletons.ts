/** Skeleton loaders. Inline style is used only for the dynamic width/height. */

import { el } from '../lib/dom';

export function skelLine(width: string, height = '12px', marginBottom = '8px'): HTMLElement {
  return el('div', { class: 'skel', style: `height:${height}; width:${width}; margin-bottom:${marginBottom};` });
}

/** A card-shaped skeleton matching the feed/search story card layout. */
export function skelCard(): HTMLElement {
  return el('div', { class: 'card' }, [
    skelLine('40%', '10px', '10px'),
    skelLine('95%', '13px', '6px'),
    skelLine('70%', '13px', '0'),
  ]);
}

/** N stacked card skeletons for list loading states. */
export function skelCards(count: number): HTMLElement {
  const cards: HTMLElement[] = [];
  for (let i = 0; i < count; i += 1) cards.push(skelCard());
  return el('div', {}, cards);
}
