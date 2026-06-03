/**
 * Sources list (prototype screen 7): one row per article, each opens in a
 * background tab; "Open all N in background tabs" bulk action.
 */

import { el, render } from '../lib/dom';
import { backbar } from '../components/chrome';
import { pipClass, pipInitial } from '../lib/catalog';
import { shortAge } from '../lib/time';
import { send } from '../lib/messaging';
import { navigate } from '../router';
import type { StoryCluster, Article } from '../../shared/contracts';

export function renderSources(root: HTMLElement, cluster: StoryCluster): void {
  const content = el('div', { class: 'content' });
  const bar = backbar('Summary', () => navigate({ view: 'summary', cluster, summaryType: 'short' }));
  bar.appendChild(el('div', { class: 'title', style: 'font-size:14px;' }, [`Sources (${cluster.articles.length})`]));
  render(root, bar, content);
  draw(content, cluster);
}

function draw(content: HTMLElement, cluster: StoryCluster): void {
  if (cluster.articles.length === 0) {
    render(content, el('div', { class: 'empty-state' }, ['No source articles for this story.']));
    return;
  }
  render(
    content,
    el('div', { class: 'hint', style: 'margin-bottom:12px;' }, ['Each source opens in a new background tab — your reading position here is preserved.']),
    ...cluster.articles.map((a) => sourceRow(a)),
    el('button', { class: 'act-btn', style: 'margin-top:8px;', onClick: () => void openAll(cluster) }, [`Open all ${cluster.articles.length} in background tabs`]),
  );
}

function sourceRow(article: Article): HTMLElement {
  return el('button', {
    class: 'src-row',
    'aria-label': `Open ${article.sourceName} article in a background tab: ${article.title}`,
    onClick: () => void open([article.url]),
  }, [
    el('span', { class: `src-pip ${pipClass(article.sourceId)}` }, [pipInitial(article.sourceName)]),
    el('div', { class: 's-body' }, [
      el('div', { class: 's-name' }, [`${article.sourceName} · ${shortAge(article.publishedAt)}`]),
      el('div', { class: 's-title' }, [article.title]),
    ]),
    el('span', { class: 's-open' }, ['↗']),
  ]);
}

async function open(urls: readonly string[]): Promise<void> {
  await send({ type: 'tabs/openSources', urls });
}

async function openAll(cluster: StoryCluster): Promise<void> {
  await open(cluster.articles.map((a) => a.url));
}
