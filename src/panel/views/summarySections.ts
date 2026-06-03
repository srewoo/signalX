/**
 * Renders SummarySections for the complete state. Key Facts (prototype screen 4)
 * uses a numbered list; short/detailed (screen 3) use the four narrative blocks.
 * All content is LLM output — inserted only as text.
 */

import { el } from '../lib/dom';
import type { Summary } from '../../shared/contracts';

export function renderSummarySections(summary: Summary): HTMLElement {
  if (summary.type === 'keyfacts') return keyFactsBlock(summary);
  return narrativeBlocks(summary);
}

function keyFactsBlock(summary: Summary): HTMLElement {
  const facts = summary.sections.keyFacts ?? [];
  if (facts.length === 0) {
    return el('div', { class: 'sum-block' }, [el('p', { class: 'hint' }, ['No key facts available for this story.'])]);
  }
  const rows = facts.map((fact, i) =>
    el('div', { class: 'kf-row' }, [el('span', { class: 'keyfact-num' }, [String(i + 1)]), fact]),
  );
  return el('div', { class: 'sum-block' }, rows);
}

function narrativeBlocks(summary: Summary): HTMLElement {
  const { whatHappened, keyEvents, importantQuotes, whatHappensNext } = summary.sections;
  const blocks: HTMLElement[] = [];

  if (whatHappened) blocks.push(textBlock('What happened', whatHappened));
  if (keyEvents.length > 0) {
    blocks.push(el('div', { class: 'sum-block' }, [
      el('h4', {}, ['Key events']),
      el('ul', {}, keyEvents.map((e) => el('li', {}, [e]))),
    ]));
  }
  if (importantQuotes.length > 0) {
    blocks.push(el('div', { class: 'sum-block' }, [
      el('h4', {}, ['Important quotes']),
      ...importantQuotes.map((q) => el('p', { class: 'quote' }, [q])),
    ]));
  }
  if (whatHappensNext) blocks.push(textBlock('What happens next', whatHappensNext));

  return el('div', {}, blocks);
}

function textBlock(title: string, body: string): HTMLElement {
  return el('div', { class: 'sum-block' }, [el('h4', {}, [title]), el('p', {}, [body])]);
}
