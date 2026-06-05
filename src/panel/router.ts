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

// Cleanups registered by the active view/components, run when we leave the
// current route. Without this the router replaces #app's children with no
// unmount hook, leaking whatever the previous view left running — most
// importantly an open streaming port (which keeps billing the user's API key),
// plus document-level listeners, debounce timers, and detached-node refs.
let cleanups: Array<() => void> = [];

// Bumped on every navigation. Async loaders capture the epoch before an await
// and bail if it changed, so a slow fetch can't render into a detached
// container after the user has navigated away.
let epoch = 0;

/** Register a cleanup to run on the next navigation away from the current route. */
export function onLeave(fn: () => void): void {
  cleanups.push(fn);
}

/** Monotonic navigation counter; see epoch comment above. */
export function navEpoch(): number {
  return epoch;
}

function runCleanups(): void {
  const fns = cleanups;
  cleanups = [];
  for (const fn of fns) {
    try {
      fn();
    } catch {
      /* a faulty cleanup must not block navigation */
    }
  }
}

export function initRouter(initial: Route, onRender: Renderer): void {
  current = initial;
  renderer = onRender;
  renderer(current);
}

export function navigate(route: Route): void {
  runCleanups();
  epoch += 1;
  current = route;
  renderer?.(route);
}

export function currentRoute(): Route {
  return current;
}
