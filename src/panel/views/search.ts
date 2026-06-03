/**
 * Search (prototype screen 10): debounced query, pinned AI Overview card that is
 * key-gated (dashed "Add key" link when no provider), result cards, skeletons,
 * empty + error states. Search itself works keyless.
 */

import { el, render } from '../lib/dom';
import { icon } from '../lib/icons';
import { topbar } from '../components/chrome';
import { storyCard } from '../components/storyCard';
import { skelCards } from '../components/skeletons';
import { errorCard } from '../components/errorCard';
import { send } from '../lib/messaging';
import { navigate, type AppContext } from '../router';
import type { StoryCluster } from '../../shared/contracts';

const DEBOUNCE_MS = 300;

export function renderSearch(root: HTMLElement, ctx: AppContext, initialQuery = ''): void {
  const content = el('div', { class: 'content' });
  let timer: ReturnType<typeof setTimeout> | undefined;

  const input = el('input', {
    type: 'search',
    value: initialQuery,
    placeholder: 'Search any topic…',
    'aria-label': 'Search any topic',
    onInput: (e) => {
      const value = (e.currentTarget as HTMLInputElement).value;
      bar.className = value ? 'search-input active' : 'search-input';
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void run(content, ctx, value), DEBOUNCE_MS);
    },
    onKeyDown: (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (timer) clearTimeout(timer);
        void run(content, ctx, (e.currentTarget as HTMLInputElement).value);
      }
    },
  });

  const clearBtn = el('button', { class: 'search-clear', 'aria-label': 'Clear search', onClick: () => {
    input.value = '';
    bar.className = 'search-input';
    input.focus();
    showIdle(content);
  } }, [icon('x', 16)]);

  const bar = el('div', { class: initialQuery ? 'search-input active' : 'search-input' }, [icon('search', 16), input, clearBtn]);

  render(root, topbar('SignalX', 'search'), el('div', { class: 'searchbar' }, [bar]), content);

  input.focus();
  if (initialQuery) void run(content, ctx, initialQuery);
  else showIdle(content);
}

function showIdle(content: HTMLElement): void {
  render(content, el('div', { class: 'empty-state' }, ['Search news across BBC, Reuters, Times of India and more.']));
}

async function run(content: HTMLElement, ctx: AppContext, query: string): Promise<void> {
  const trimmed = query.trim();
  if (!trimmed) {
    showIdle(content);
    return;
  }
  render(content, aiOverviewCard(ctx, trimmed, 0), skelCards(3));

  const res = await send({ type: 'search/query', query: trimmed, country: ctx.country });
  if (!res.ok) {
    render(content, errorCard(res.error, { onRetry: () => void run(content, ctx, trimmed) }));
    return;
  }

  const { clusters, totalArticles } = res.value;
  if (clusters.length === 0) {
    render(content, el('div', { class: 'empty-state' }, [`No results for "${trimmed}". Try a different topic.`]));
    return;
  }

  render(
    content,
    el('div', { class: 'section-h' }, [`${totalArticles} results · past 7 days`]),
    aiOverviewCard(ctx, trimmed, clusters.length),
    resultList(clusters),
  );
}

function aiOverviewCard(ctx: AppContext, query: string, count: number): HTMLElement {
  if (!ctx.hasProvider) {
    return el('div', { class: 'card dashed' }, [
      el('div', { class: 'meta' }, [el('span', { class: 'src ai-overview muted' }, [icon('sparkles', 13), el('span', {}, ['AI Overview'])])]),
      el('p', { class: 'hint' }, [
        count > 0
          ? `Add your AI key in Settings to get an instant overview of all ${count} results.`
          : 'Add your AI key in Settings to get an instant overview of your results.',
      ]),
      el('div', { class: 'sources-row' }, [
        el('button', { class: 'summarize-link', onClick: () => navigate({ view: 'settings' }) }, [el('span', {}, ['Add key']), icon('chevron-right', 14)]),
      ]),
    ]);
  }
  return el('div', { class: 'card' }, [
    el('div', { class: 'meta' }, [el('span', { class: 'src ai-overview' }, [icon('sparkles', 13), el('span', {}, ['AI Overview'])])]),
    el('p', { class: 'hint' }, [`AI overview of "${query}" is available — open a story to generate a summary.`]),
  ]);
}

function resultList(clusters: readonly StoryCluster[]): HTMLElement {
  const cards = clusters.map((cluster) =>
    storyCard(cluster, {
      onOpen: () => navigate({ view: 'summary', cluster, summaryType: 'short' }),
      onSummarize: () => navigate({ view: 'summary', cluster, summaryType: 'short' }),
    }),
  );
  return el('div', {}, cards);
}
