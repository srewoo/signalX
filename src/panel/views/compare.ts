/**
 * Source comparison (prototype screen 6): common facts, per-source colored
 * perspective cards, coverage differences, feedback row. Loading + error states.
 */

import { el, render, setText } from '../lib/dom';
import { icon } from '../lib/icons';
import { backbar } from '../components/chrome';
import { errorCard } from '../components/errorCard';
import { skelLine } from '../components/skeletons';
import { perspClass } from '../lib/catalog';
import { send } from '../lib/messaging';
import { navigate, navEpoch } from '../router';
import type { StoryCluster, SourceComparison } from '../../shared/contracts';

export function renderCompare(root: HTMLElement, cluster: StoryCluster): void {
  const content = el('div', { class: 'content' });
  render(root, backbar('Summary', () => navigate({ view: 'summary', cluster, summaryType: 'short' })), content);
  void load(content, cluster);
}

async function load(content: HTMLElement, cluster: StoryCluster): Promise<void> {
  const e = navEpoch();
  render(content, loadingSkeleton());
  const res = await send({ type: 'compare/get', clusterId: cluster.id, cluster });
  if (navEpoch() !== e) return; // navigated away while comparing
  if (!res.ok) {
    render(content, errorCard(res.error, { onRetry: () => void load(content, cluster) }));
    return;
  }
  render(content, view(cluster, res.value));
}

function view(cluster: StoryCluster, cmp: SourceComparison): HTMLElement {
  return el('div', {}, [
    el('h3', { class: 'summary-title', style: 'font-size:15px;' }, [`How sources covered: ${cluster.headline}`]),
    commonFacts(cmp.commonFacts),
    el('div', { class: 'section-h' }, ['Perspectives']),
    ...perspectives(cmp.perspectives),
    coverageDifferences(cmp.coverageDifferences),
    feedbackRow(cluster.id),
  ]);
}

function commonFacts(facts: readonly string[]): HTMLElement {
  return el('div', { class: 'sum-block' }, [
    el('h4', {}, ['Common facts (all sources agree)']),
    facts.length > 0
      ? el('ul', {}, facts.map((f) => el('li', {}, [f])))
      : el('p', { class: 'hint' }, ['No shared facts identified.']),
  ]);
}

function perspectives(items: readonly { sourceName: string; perspective: string }[]): readonly HTMLElement[] {
  if (items.length === 0) return [el('div', { class: 'empty-state' }, ['No per-source perspectives available.'])];
  return items.map((p) =>
    el('div', { class: `persp ${perspClass(p.sourceName)}` }, [
      el('div', { class: 'ph' }, [p.sourceName]),
      el('p', {}, [p.perspective]),
    ]),
  );
}

function coverageDifferences(text: string): HTMLElement {
  return el('div', { class: 'sum-block' }, [
    el('h4', {}, ['Coverage differences']),
    el('p', {}, [text || 'No notable differences in coverage.']),
  ]);
}

function feedbackRow(clusterId: string): HTMLElement {
  const label = el('span', { class: 'fb-label' }, ['Was this comparison useful?']);
  const up = el('button', { class: 'fb-btn', 'aria-label': 'Useful' }, [icon('thumbs-up', 16)]);
  const down = el('button', { class: 'fb-btn', 'aria-label': 'Not useful' }, [icon('thumbs-down', 16)]);

  const submit = async (verdict: 'up' | 'down'): Promise<void> => {
    up.classList.toggle('on', verdict === 'up');
    down.classList.toggle('on', verdict === 'down');
    up.disabled = true;
    down.disabled = true;
    await send({ type: 'feedback/submit', clusterId, target: 'comparison', verdict });
    setText(label, 'Thanks for the feedback.');
  };

  up.addEventListener('click', () => void submit('up'));
  down.addEventListener('click', () => void submit('down'));
  return el('div', { class: 'fb-row' }, [label, up, down]);
}

function loadingSkeleton(): HTMLElement {
  return el('div', {}, [
    el('div', { class: 'sum-block' }, [skelLine('60%', '14px', '10px'), skelLine('90%'), skelLine('80%', '12px', '0')]),
    el('div', { class: 'persp' }, [skelLine('30%', '12px', '8px'), skelLine('95%', '12px', '0')]),
    el('div', { class: 'persp' }, [skelLine('30%', '12px', '8px'), skelLine('88%', '12px', '0')]),
  ]);
}
