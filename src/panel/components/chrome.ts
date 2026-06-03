/** Shared header chrome: top bar with logo + nav rail, and the back row. */

import { el } from '../lib/dom';
import { icon, type IconName } from '../lib/icons';
import { navigate, type NavTab } from '../router';

interface NavItem {
  readonly tab: NavTab;
  readonly glyph: IconName;
  readonly label: string;
}

const NAV: readonly NavItem[] = [
  { tab: 'feed', glyph: 'home', label: 'Feed' },
  { tab: 'search', glyph: 'search', label: 'Search' },
  { tab: 'saved', glyph: 'bookmark', label: 'Saved' },
  { tab: 'settings', glyph: 'settings', label: 'Settings' },
];

function navRail(active: NavTab | null): HTMLElement {
  const buttons = NAV.map((item) =>
    el(
      'button',
      {
        class: item.tab === active ? 'nav-ico on' : 'nav-ico',
        'aria-label': item.label,
        'aria-pressed': item.tab === active,
        onClick: () => navigate({ view: item.tab }),
      },
      [icon(item.glyph, 18)],
    ),
  );
  return el('nav', { class: 'nav-rail', 'aria-label': 'Primary' }, buttons);
}

/** Top bar with the SignalX logo, title, and the nav rail (used on root views). */
export function topbar(title: string, active: NavTab | null): HTMLElement {
  return el('header', { class: 'topbar' }, [
    el('div', { class: 'logo' }, ['S']),
    el('div', { class: 'title' }, [title]),
    el('div', { class: 'spacer' }),
    navRail(active),
  ]);
}

/** Top bar variant with a Back control and optional trailing actions (detail views). */
export function backbar(label: string, onBack: () => void, ...actions: readonly HTMLElement[]): HTMLElement {
  return el('header', { class: 'topbar' }, [
    el('button', { class: 'back-row', 'aria-label': `Back to ${label}`, onClick: onBack }, [
      icon('chevron-left', 18),
      el('span', {}, [label]),
    ]),
    el('div', { class: 'spacer' }),
    ...actions,
  ]);
}

/** A trailing icon button for back bars (bookmark, share, stop, etc.). */
export function iconAction(name: IconName, label: string, onClick: () => void, extraClass = 'nav-ico'): HTMLButtonElement {
  return el('button', { class: extraClass, 'aria-label': label, title: label, onClick }, [icon(name, 18)]);
}
