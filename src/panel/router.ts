/**
 * Minimal view-state machine. Each route carries the params its view needs.
 * Navigation re-renders the single #app root via the registered renderer.
 */

import type { CountryCode, Category, SummaryType, StoryCluster } from '../shared/contracts';

export type Route =
  | { readonly view: 'firstrun' }
  | { readonly view: 'feed' }
  | { readonly view: 'search'; readonly query?: string }
  | { readonly view: 'summary'; readonly cluster: StoryCluster; readonly summaryType: SummaryType }
  | { readonly view: 'compare'; readonly cluster: StoryCluster }
  | { readonly view: 'sources'; readonly cluster: StoryCluster }
  | { readonly view: 'saved' }
  | { readonly view: 'settings' };

export type NavTab = 'feed' | 'search' | 'saved' | 'settings';

/** Which nav-rail icon should appear active for a given route. */
export function activeTab(route: Route): NavTab | null {
  switch (route.view) {
    case 'feed':
      return 'feed';
    case 'search':
      return 'search';
    case 'saved':
      return 'saved';
    case 'settings':
      return 'settings';
    default:
      return null;
  }
}

/** Shared, persisted-ish session context the views read from. */
export interface AppContext {
  country: CountryCode;
  category: Category;
  hasProvider: boolean;
}

type Renderer = (route: Route) => void;

let current: Route = { view: 'feed' };
let renderer: Renderer | null = null;

export function initRouter(initial: Route, onRender: Renderer): void {
  current = initial;
  renderer = onRender;
  renderer(current);
}

export function navigate(route: Route): void {
  current = route;
  renderer?.(route);
}

export function currentRoute(): Route {
  return current;
}
