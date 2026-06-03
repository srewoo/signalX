/**
 * Panel boot. Loads prefs (applies theme), checks for a configured provider, and
 * routes to first run (keyless, not yet skipped) or the feed. The router calls
 * dispatch() to render each Route into the single #app root.
 */

import { DEFAULT_PREFS, type Preferences } from '../shared/contracts';
import { send } from './lib/messaging';
import { applyTheme } from './lib/theme';
import { initRouter, type Route, type AppContext } from './router';
import { renderFeed } from './views/feed';
import { renderSearch } from './views/search';
import { renderSummary } from './views/summary';
import { renderCompare } from './views/compare';
import { renderSources } from './views/sources';
import { renderSaved } from './views/saved';
import { renderSettings } from './views/settings';
import { renderFirstRun, hasSkippedOnboarding } from './views/firstrun';

const ctx: AppContext = { country: DEFAULT_PREFS.country, category: 'top', hasProvider: false };

function dispatch(route: Route): void {
  const root = document.getElementById('app');
  if (!root) return;
  switch (route.view) {
    case 'firstrun':
      renderFirstRun(root);
      break;
    case 'feed':
      renderFeed(root, ctx);
      break;
    case 'search':
      renderSearch(root, ctx, route.query ?? '');
      break;
    case 'summary':
      renderSummary(root, ctx, route.cluster, route.summaryType);
      break;
    case 'compare':
      renderCompare(root, route.cluster);
      break;
    case 'sources':
      renderSources(root, route.cluster);
      break;
    case 'saved':
      renderSaved(root);
      break;
    case 'settings':
      renderSettings(root, ctx);
      break;
  }
}

async function boot(): Promise<void> {
  const [prefsRes, provRes] = await Promise.all([
    send({ type: 'settings/getPrefs' }),
    send({ type: 'settings/getProvider' }),
  ]);

  const prefs: Preferences = prefsRes.ok ? prefsRes.value : DEFAULT_PREFS;
  ctx.country = prefs.country;
  applyTheme(prefs.theme);

  ctx.hasProvider = provRes.ok && provRes.value !== null;

  const initial: Route = !ctx.hasProvider && !hasSkippedOnboarding() ? { view: 'firstrun' } : { view: 'feed' };
  initRouter(initial, dispatch);
}

void boot();
