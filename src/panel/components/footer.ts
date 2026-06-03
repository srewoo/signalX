/**
 * Small footer with Help + Privacy Policy links. The links open the bundled,
 * fully-offline static pages in a new browser tab via chrome.tabs.create — they
 * are extension pages, not remote URLs.
 */

import { el } from '../lib/dom';
import { HELP_PAGE, PRIVACY_PAGE, openPage } from '../lib/pages';

export function pageFooter(): HTMLElement {
  return el('nav', { class: 'page-footer', 'aria-label': 'Help and legal' }, [
    el('button', { class: 'footer-link', onClick: () => openPage(HELP_PAGE) }, ['Help']),
    el('span', { class: 'footer-sep' }, ['·']),
    el('button', { class: 'footer-link', onClick: () => openPage(PRIVACY_PAGE) }, ['Privacy Policy']),
  ]);
}
