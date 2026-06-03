/**
 * Search (prototype screen 10): debounced query, pinned AI Overview card that is
 * key-gated (dashed "Add key" link when no provider), result cards, skeletons,
 * empty + error states. Search itself works keyless.
 *
 * When a provider is configured and a search returns clusters, an AI overview is
 * generated automatically. The overview card mutates in place through skeleton,
 * prose+meta, then error, independently of the result list, so an overview failure
 * never hides the articles. A monotonically increasing sequence token guards
 * against stale overview responses when a newer search has started.
 */

import { el, render } from '../lib/dom';
import { icon } from '../lib/icons';
import { topbar } from '../components/chrome';
import { storyCard } from '../components/storyCard';
import { skelCards, skelLine } from '../components/skeletons';
import { errorCard } from '../components/errorCard';
import { send } from '../lib/messaging';
import { navigate, type AppContext } from '../router';
import type { StoryCluster, AppError } from '../../shared/contracts';

const DEBOUNCE_MS = 300;

export function renderSearch(root: HTMLElement, ctx: AppContext, initialQuery = ''): void {
  const content = el('div', { class: 'content' });
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Monotonic token: each run() bumps it; pending overview work tied to an old
  // token is discarded so a stale response can never overwrite fresh results.
  const seq = { value: 0 };

  const input = el('input', {
    type: 'search',
    value: initialQuery,
    placeholder: 'Search any topic…',
    'aria-label': 'Search any topic',
    onInput: (e) => {
      const value = (e.currentTarget as HTMLInputElement).value;
      bar.className = value ? 'search-input active' : 'search-input';
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void run(content, ctx, value, seq), DEBOUNCE_MS);
    },
    onKeyDown: (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (timer) clearTimeout(timer);
        void run(content, ctx, (e.currentTarget as HTMLInputElement).value, seq);
      }
    },
  });

  const clearBtn = el('button', { class: 'search-clear', 'aria-label': 'Clear search', onClick: () => {
    input.value = '';
    bar.className = 'search-input';
    input.focus();
    seq.value += 1; // cancel any in-flight overview
    showIdle(content);
  } }, [icon('x', 16)]);

  const bar = el('div', { class: initialQuery ? 'search-input active' : 'search-input' }, [icon('search', 16), input, clearBtn]);

  render(root, topbar('SignalX', 'search'), el('div', { class: 'searchbar' }, [bar]), content);

  input.focus();
  if (initialQuery) void run(content, ctx, initialQuery, seq);
  else showIdle(content);
}

function showIdle(content: HTMLElement): void {
  render(content, el('div', { class: 'empty-state' }, ['Search news across BBC, Reuters, Times of India and more.']));
}

interface Seq { value: number }

async function run(content: HTMLElement, ctx: AppContext, query: string, seq: Seq): Promise<void> {
  const token = (seq.value += 1);
  const trimmed = query.trim();
  if (!trimmed) {
    showIdle(content);
    return;
  }
  render(content, keylessOverviewCard(0), skelCards(3));

  const res = await send({ type: 'search/query', query: trimmed, country: ctx.country });
  if (token !== seq.value) return; // a newer search superseded this one
  if (!res.ok) {
    render(content, errorCard(res.error, { onRetry: () => void run(content, ctx, trimmed, seq) }));
    return;
  }

  const { clusters, totalArticles } = res.value;
  if (clusters.length === 0) {
    render(content, el('div', { class: 'empty-state' }, [`No results for "${trimmed}". Try a different topic.`]));
    return;
  }

  // The overview card is a stable node so it can mutate in place while the
  // result list below stays mounted regardless of overview outcome.
  const overview = el('div', {});
  render(
    content,
    el('div', { class: 'section-h' }, [`${totalArticles} results · past 7 days`]),
    overview,
    resultList(clusters),
  );

  if (!ctx.hasProvider) {
    render(overview, keylessOverviewCard(clusters.length));
    return;
  }
  void generateOverview(overview, trimmed, clusters, token, seq);
}

async function generateOverview(
  host: HTMLElement,
  query: string,
  clusters: readonly StoryCluster[],
  token: number,
  seq: Seq,
): Promise<void> {
  render(host, overviewLoadingCard());

  const res = await send({
    type: 'search/overview',
    query,
    clusterIds: clusters.map((c) => c.id),
  });
  if (token !== seq.value) return; // stale: a newer search is in flight

  if (!res.ok) {
    render(host, overviewErrorCard(res.error, () => void generateOverview(host, query, clusters, token, seq)));
    return;
  }
  render(host, overviewResultCard(res.value.overview, res.value.model, res.value.estCostUsd, res.value.cached));
}

/** Dashed keyless prompt (unchanged behavior): nudge to add a key in Settings. */
function keylessOverviewCard(count: number): HTMLElement {
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

/** Skeleton lines inside the pinned overview card while the model responds. */
function overviewLoadingCard(): HTMLElement {
  return el('div', { class: 'card' }, [
    el('div', { class: 'meta' }, [
      el('span', { class: 'src ai-overview' }, [icon('sparkles', 13), el('span', {}, ['AI Overview'])]),
      el('span', { class: 'dot' }),
      el('span', { class: 'gen-live' }, ['Generating…']),
    ]),
    skelLine('95%', '12px', '7px'),
    skelLine('100%', '12px', '7px'),
    skelLine('60%', '12px', '0'),
  ]);
}

/** Completed overview: prose + small gen-meta (model · cost, or cached · $0.000). */
function overviewResultCard(overview: string, model: string, estCostUsd: number, cached: boolean): HTMLElement {
  const meta = cached ? 'cached · $0.000' : `${model} · ~$${estCostUsd.toFixed(3)}`;
  return el('div', { class: 'card' }, [
    el('div', { class: 'meta' }, [el('span', { class: 'src ai-overview' }, [icon('sparkles', 13), el('span', {}, ['AI Overview'])])]),
    el('p', { class: 'overview-prose' }, [overview]),
    el('div', { class: 'gen-meta', style: 'margin: 8px 0 0;' }, [
      el('span', { class: 'ok' }, [icon('check', 12), el('span', {}, ['Generated'])]),
      el('span', { class: 'dot' }),
      meta,
    ]),
  ]);
}

/**
 * Compact error card for an overview failure. Articles below remain visible —
 * the overview is a value-add, never a blocker. Reuses the shared errorCard so
 * every AppErrorCode maps to actionable recovery; NO_KEY/INVALID_KEY route to
 * Settings, the rest offer Retry.
 */
function overviewErrorCard(error: AppError, onRetry: () => void): HTMLElement {
  return errorCard(error, {
    onRetry,
    onUpdateKey: () => navigate({ view: 'settings' }),
    onTestKey: () => navigate({ view: 'settings' }),
    onSwitchModel: () => navigate({ view: 'settings' }),
    onSwitchProvider: () => navigate({ view: 'settings' }),
  });
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
