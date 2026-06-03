/**
 * Paths to the self-contained static pages (Help, Privacy) shipped inside the
 * extension. Centralized here so that if the bundler's emitted layout changes,
 * only one place needs editing.
 *
 * chrome.runtime.getURL resolves a path RELATIVE TO THE EXTENSION ROOT (dist/).
 * Vite preserves HTML entry paths, so a source file at src/panel/pages/help.html
 * is emitted to dist/src/panel/pages/help.html — i.e. the same relative path.
 */

export const HELP_PAGE = 'src/panel/pages/help.html' as const;
export const PRIVACY_PAGE = 'src/panel/pages/privacy.html' as const;

/** Open one of the static pages in a new browser tab (extension page URL). */
export function openPage(path: string): void {
  void chrome.tabs.create({ url: chrome.runtime.getURL(path) });
}
