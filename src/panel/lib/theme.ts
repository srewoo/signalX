/**
 * Theme application. 'auto' relies on the prefers-color-scheme media query in
 * styles.css (no data-theme attribute). 'light'/'dark' set an explicit
 * [data-theme] override on <html>.
 */

import type { Preferences } from '../../shared/contracts';

export function applyTheme(theme: Preferences['theme']): void {
  const root = document.documentElement;
  if (theme === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}
