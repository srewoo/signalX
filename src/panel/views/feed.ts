/**
 * Home feed (prototype screens 1, 8, 12): country chip opens a bottom sheet, category
 * chips, trending topic chips (tap runs a search), story cards, "updated Xm ago"
 * + fromCache banner, skeleton loading, offline error card.
 */

import { el, render } from '../lib/dom';
import { icon } from '../lib/icons';
import { topbar } from '../components/chrome';
import { storyCard } from '../components/storyCard';
import { skelCards } from '../components/skeletons';
import { errorCard } from '../components/errorCard';
import { openSheet, optRow } from '../components/sheet';
import { COUNTRIES, CATEGORIES, country } from '../lib/catalog';
import { relativeTime } from '../lib/time';
import { send } from '../lib/messaging';
import { navigate, navEpoch, type AppContext } from '../router';
import type { CountryCode, StoryCluster } from '../../shared/contracts';

// Bumped on every feed (re)load. A category/country switch re-enters load()
// without a navigation, so two loads can be in flight at once; the stale one
// must not render. navEpoch additionally guards navigation away from the feed.
let feedSeq = 0;

export function renderFeed(root: HTMLElement, ctx: AppContext): void {
  const content = el('div', { class: 'content' });
  render(
    root,
    topbar('SignalX', 'feed'),
    searchbarStub(),
    categoryChips(ctx),
    content,
  );
  void load(content, ctx);
}

function searchbarStub(): HTMLElement {
  return el('div', { class: 'searchbar' }, [
    el('button', { class: 'search-input', 'aria-label': 'Search any topic', onClick: () => navigate({ view: 'search' }) }, [
      icon('search', 16),
      el('span', {}, ['Search any topic…']),
    ]),
  ]);
}

function categoryChips(ctx: AppContext): HTMLElement {
  const chips = CATEGORIES.map((c) =>
    el('button', {
      class: c.id === ctx.category ? 'chip on' : 'chip',
      'aria-pressed': c.id === ctx.category,
      onClick: () => {
        ctx.category = c.id;
        const root = document.getElementById('app');
        if (root) renderFeed(root, ctx);
      },
    }, [c.label]),
  );
  return el('div', { class: 'chips' }, chips);
}

function countryHeader(ctx: AppContext, content: HTMLElement, fetchedAt: string, fromCache: boolean): HTMLElement {
  const chip = el('button', { class: 'country-chip', 'aria-label': 'Change country', onClick: () => openCountrySheet(ctx, content) }, [
    icon('globe', 14),
    el('span', {}, [country(ctx.country).name]),
  ]);
  return el('div', { class: 'section-h' }, [
    'Top stories',
    el('span', { class: 'meta-right' }, [chip, ` · ${fromCache ? 'cached' : 'updated'} ${relativeTime(fetchedAt)}`]),
  ]);
}

function openCountrySheet(ctx: AppContext, content: HTMLElement): void {
  const rows = COUNTRIES.map((c) =>
    optRow(c.name, c.code === ctx.country, () => {
      void selectCountry(ctx, c.code, content, handle);
    }, 'globe'),
  );
  const handle = openSheet('Default country', rows);
}

async function selectCountry(ctx: AppContext, code: CountryCode, content: HTMLElement, handle: { close: () => void }): Promise<void> {
  ctx.country = code;
  const prefsRes = await send({ type: 'settings/getPrefs' });
  if (prefsRes.ok) {
    await send({ type: 'settings/setPrefs', prefs: { ...prefsRes.value, country: code } });
  }
  handle.close();
  void load(content, ctx);
}

async function load(content: HTMLElement, ctx: AppContext): Promise<void> {
  const token = ++feedSeq;
  const e = navEpoch();
  render(content, trendingSection([]), skelCards(3));

  const [feedRes, trendingRes] = await Promise.all([
    send({ type: 'feed/get', country: ctx.country, category: ctx.category }),
    send({ type: 'feed/trending', country: ctx.country }),
  ]);

  // A newer load (category/country switch) or a navigation superseded this one.
  if (token !== feedSeq || navEpoch() !== e) return;

  const topics = trendingRes.ok ? trendingRes.value.topics : [];

  if (!feedRes.ok) {
    render(content, trendingSection(topics), errorCard(feedRes.error, { onRetry: () => void load(content, ctx) }));
    return;
  }

  const { clusters, fetchedAt, fromCache } = feedRes.value;
  render(
    content,
    trendingSection(topics),
    fromCache ? errorCard({ code: 'OFFLINE', message: `Showing cached headlines from ${relativeTime(fetchedAt)}. We'll refresh automatically when you're back online.` }, { onRetry: () => void load(content, ctx) }) : null,
    countryHeader(ctx, content, fetchedAt, fromCache),
    clusters.length === 0 ? emptyState() : clusterList(clusters),
  );
}

function clusterList(clusters: readonly StoryCluster[]): HTMLElement {
  const cards = clusters.map((cluster) =>
    storyCard(cluster, {
      onOpen: () => navigate({ view: 'summary', cluster, summaryType: 'short' }),
      onSummarize: () => navigate({ view: 'summary', cluster, summaryType: 'short' }),
    }),
  );
  return el('div', {}, cards);
}

function trendingSection(topics: readonly string[]): HTMLElement {
  const chips = topics.map((t) =>
    el('button', { class: 'topic-chip', onClick: () => navigate({ view: 'search', query: t }) }, [`# ${t}`]),
  );
  return el('div', {}, [
    el('div', { class: 'section-h' }, ['Trending topics']),
    el('div', { class: 'chips inline' }, chips.length > 0 ? chips : [el('span', { class: 'hint' }, ['No trending topics right now.'])]),
  ]);
}

function emptyState(): HTMLElement {
  return el('div', { class: 'empty-state' }, ['No stories for this category yet. Try another category or check back soon.']);
}
