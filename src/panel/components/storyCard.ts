/** Story cluster card with source pips + sparkles "Summarize" (feed/search screens). */

import { el } from '../lib/dom';
import { icon } from '../lib/icons';
import { relativeTime } from '../lib/time';
import { pipClass, pipInitial } from '../lib/catalog';
import type { StoryCluster, Article } from '../../shared/contracts';

const MAX_PIPS = 3;

function pipPile(articles: readonly Article[]): HTMLElement {
  const shown = articles.slice(0, MAX_PIPS);
  const pips = shown.map((a) =>
    el('span', { class: `src-pip ${pipClass(a.sourceId)}` }, [pipInitial(a.sourceName)]),
  );
  return el('div', { class: 'src-pile' }, pips);
}

export interface StoryCardOptions {
  readonly onOpen: () => void;
  readonly onSummarize: () => void;
}

export function storyCard(cluster: StoryCluster, opts: StoryCardOptions): HTMLElement {
  const lead = cluster.articles[0];
  const count = cluster.articles.length;
  const extra = count - MAX_PIPS;

  const meta = el('div', { class: 'meta' }, [
    lead ? el('span', { class: 'src' }, [lead.sourceName]) : null,
    lead ? el('span', { class: 'dot' }) : null,
    lead ? el('span', {}, [relativeTime(lead.publishedAt)]) : null,
    el('span', { class: 'dot' }),
    el('span', {}, [`${count} source${count === 1 ? '' : 's'}`]),
  ]);

  const sourcesRow = el('div', { class: 'sources-row' }, [
    pipPile(cluster.articles),
    extra > 0 ? el('span', { class: 'more-src' }, [`+${extra}`]) : null,
    el('button', { class: 'summarize-link', 'aria-label': `Summarize: ${cluster.headline}`, onClick: (e) => { e.stopPropagation(); opts.onSummarize(); } }, [icon('sparkles', 14), el('span', {}, ['Summarize'])]),
  ]);

  return el('button', { class: 'card', onClick: opts.onOpen, 'aria-label': cluster.headline }, [
    meta,
    el('h3', {}, [cluster.headline]),
    sourcesRow,
  ]);
}
