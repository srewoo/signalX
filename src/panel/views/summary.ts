/**
 * AI Summary (prototype screens 2-5, 9). Short/Detailed/Keyfacts tabs; streaming
 * state (text fills "what happened" with a blinking cursor, skeletons for later
 * sections, ◼ Stop disconnects the port); complete state with gen-meta + feedback
 * + regenerate + compare/sources actions; all AppErrorCode error cards; save sheet.
 */

import { el, render } from '../lib/dom';
import { backbar, iconAction } from '../components/chrome';
import { errorCard, type ErrorActions } from '../components/errorCard';
import { skelLine } from '../components/skeletons';
import { openSaveSheet } from '../components/saveSheet';
import { SUMMARY_TABS, provider } from '../lib/catalog';
import { openSummaryStream, send, type StreamController } from '../lib/messaging';
import { navigate, type AppContext } from '../router';
import { renderSummarySections } from './summarySections';
import type { StoryCluster, SummaryType, Summary, SummarySections } from '../../shared/contracts';

interface Session {
  readonly content: HTMLElement;
  readonly ctx: AppContext;
  readonly cluster: StoryCluster;
  readonly stopBtn: HTMLButtonElement;
  type: SummaryType;
  controller: StreamController | undefined;
  partial: Partial<Record<keyof SummarySections, string>>;
}

export function renderSummary(root: HTMLElement, ctx: AppContext, cluster: StoryCluster, type: SummaryType): void {
  const content = el('div', { class: 'content' });
  const stopBtn = el('button', { class: 'stop-btn', 'aria-label': 'Stop generating', onClick: () => session.controller?.stop() }, ['◼ Stop']);
  const session: Session = { content, ctx, cluster, stopBtn, type, controller: undefined, partial: {} };

  render(root, backbar('Back', () => { session.controller?.stop(); navigate({ view: 'feed' }); }, stopBtn), content);
  void start(session);
}

function header(s: Session): HTMLElement {
  return el('h3', { class: 'summary-title' }, [s.cluster.headline]);
}

function tabs(s: Session): HTMLElement {
  const items = SUMMARY_TABS.map((t) =>
    el('button', {
      class: t.type === s.type ? 'sum-tab on' : 'sum-tab',
      'aria-pressed': t.type === s.type,
      onClick: () => {
        if (t.type === s.type) return;
        s.controller?.stop();
        s.type = t.type;
        void start(s);
      },
    }, [t.label]),
  );
  return el('div', { class: 'sum-tabs', role: 'tablist' }, items);
}

async function start(s: Session): Promise<void> {
  if (!s.ctx.hasProvider) {
    render(s.content, header(s), errorCard(
      { code: 'NO_KEY', message: 'Add an AI key in Settings to generate summaries. Headlines and search work without one.' },
      { onUpdateKey: () => navigate({ view: 'settings' }) },
    ));
    s.stopBtn.style.display = 'none';
    return;
  }

  const cached = await send({ type: 'summary/get', clusterId: s.cluster.id, summaryType: s.type });
  if (cached.ok && cached.value) {
    s.stopBtn.style.display = 'none';
    renderComplete(s, cached.value);
    return;
  }

  s.stopBtn.style.display = '';
  renderStreaming(s);
}

function renderStreaming(s: Session): void {
  s.partial = {};
  const cursor = el('span', { class: 'cursor' });
  const whatHappenedP = el('p', {}, [cursor]);

  render(
    s.content,
    header(s),
    el('div', { class: 'gen-meta' }, [
      el('span', { class: 'gen-live' }, ['✦ Generating…']),
      el('span', { class: 'dot' }),
      `reading ${s.cluster.articles.length} sources`,
    ]),
    tabs(s),
    block('What happened', whatHappenedP),
    skelBlock('Key events', 3),
    skelBlock('Important quotes', 1),
  );

  s.controller = openSummaryStream(
    { type: 'stream/start', clusterId: s.cluster.id, summaryType: s.type },
    {
      onDelta: (section, text) => {
        s.partial[section] = (s.partial[section] ?? '') + text;
        if (section === 'whatHappened') {
          whatHappenedP.replaceChildren(document.createTextNode(s.partial.whatHappened ?? ''), cursor);
        }
      },
      onDone: (summary) => { s.stopBtn.style.display = 'none'; renderComplete(s, summary); },
      onError: (error) => {
        s.stopBtn.style.display = 'none';
        render(s.content, header(s), tabs(s), errorCard(error, errorActions(s)));
      },
    },
  );
}

function renderComplete(s: Session, summary: Summary): void {
  const root = document.getElementById('app');
  const head = root?.querySelector('header');
  if (head) head.replaceWith(completeBar(s, summary));

  render(
    s.content,
    header(s),
    genMeta(s, summary),
    tabs(s),
    renderSummarySections(summary),
    feedbackRow(s),
    el('div', { class: 'actions-row', style: 'margin-top:10px;' }, [
      el('button', { class: 'act-btn primary', onClick: () => navigate({ view: 'compare', cluster: s.cluster }) }, ['⇄ Compare sources']),
      el('button', { class: 'act-btn', onClick: () => navigate({ view: 'sources', cluster: s.cluster }) }, [`Sources (${s.cluster.articles.length})`]),
    ]),
  );
}

function completeBar(s: Session, summary: Summary): HTMLElement {
  const save = iconAction('🔖', 'Save summary', () =>
    void openSaveSheet((folderId) => ({
      kind: 'summary',
      id: `${s.cluster.id}:${s.type}`,
      folderId,
      savedAt: new Date().toISOString(),
      headline: s.cluster.headline,
      summary,
    })),
  );
  const sources = iconAction('⤴', 'Open sources', () => navigate({ view: 'sources', cluster: s.cluster }));
  return backbar('Back', () => navigate({ view: 'feed' }), save, sources);
}

function genMeta(s: Session, summary: Summary): HTMLElement {
  const cost = summary.cached
    ? 'cached · $0.000'
    : `${summary.model} · ${(summary.latencyMs / 1000).toFixed(1)}s · ~$${summary.estCostUsd.toFixed(3)}`;
  return el('div', { class: 'gen-meta' }, [
    el('span', { class: 'ok' }, ['✓ Generated']),
    el('span', { class: 'dot' }),
    `${s.cluster.articles.length} sources`,
    el('span', { class: 'dot' }),
    cost,
  ]);
}

function feedbackRow(s: Session): HTMLElement {
  const up = el('button', { class: 'fb-btn', 'aria-label': 'Useful', onClick: () => void submit('up') }, ['👍']);
  const down = el('button', { class: 'fb-btn', 'aria-label': 'Not useful', onClick: () => void submit('down') }, ['👎']);
  const regen = el('button', { class: 'fb-btn', title: 'Regenerate', 'aria-label': 'Regenerate summary', onClick: () => { s.controller?.stop(); renderStreaming(s); } }, ['↻']);

  const submit = async (verdict: 'up' | 'down'): Promise<void> => {
    up.classList.toggle('on', verdict === 'up');
    down.classList.toggle('on', verdict === 'down');
    await send({ type: 'feedback/submit', clusterId: s.cluster.id, summaryType: s.type, verdict });
  };

  return el('div', { class: 'fb-row' }, [el('span', { class: 'fb-label' }, ['Was this summary useful?']), up, down, regen]);
}

function errorActions(s: Session): ErrorActions {
  return {
    onRetry: () => void start(s),
    onSwitchModel: () => navigate({ view: 'settings' }),
    onSwitchProvider: () => navigate({ view: 'settings' }),
    onUpdateKey: () => navigate({ view: 'settings' }),
    onTestKey: () => navigate({ view: 'settings' }),
    onOpenBilling: () => void openBilling(),
  };
}

async function openBilling(): Promise<void> {
  const res = await send({ type: 'settings/getProvider' });
  if (res.ok && res.value) {
    await send({ type: 'tabs/openSources', urls: [provider(res.value.provider).billingUrl] });
  }
}

function block(title: string, body: HTMLElement): HTMLElement {
  return el('div', { class: 'sum-block' }, [el('h4', {}, [title]), body]);
}

function skelBlock(title: string, lines: number): HTMLElement {
  const skel: HTMLElement[] = [];
  for (let i = 0; i < lines; i += 1) skel.push(skelLine(`${90 - i * 7}%`, '12px', i === lines - 1 ? '0' : '8px'));
  return el('div', { class: 'sum-block' }, [el('h4', {}, [title]), ...skel]);
}
