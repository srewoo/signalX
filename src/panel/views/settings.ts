/**
 * Settings / BYOK (prototype screen 11): provider grid, API key input with
 * "Test key" + verified status, per-provider model select, country select,
 * default summary length, dark-mode toggle (auto/light/dark), security note.
 */

import { el, render } from '../lib/dom';
import { icon } from '../lib/icons';
import { backbar } from '../components/chrome';
import { errorCard } from '../components/errorCard';
import { pageFooter } from '../components/footer';
import { COUNTRIES, SUMMARY_LENGTHS, PROVIDERS, MODELS, defaultModel } from '../lib/catalog';
import { applyTheme } from '../lib/theme';
import { send } from '../lib/messaging';
import { navigate, type AppContext } from '../router';
import type { Preferences, ProviderId, ProviderSettings, SummaryType, CountryCode } from '../../shared/contracts';

interface Draft {
  provider: ProviderId;
  apiKey: string;
  model: string;
  keyState: 'unknown' | 'testing' | 'valid' | 'invalid';
}

export function renderSettings(root: HTMLElement, ctx: AppContext): void {
  const content = el('div', { class: 'content' });
  const bar = backbar('Back', () => navigate({ view: 'feed' }));
  bar.appendChild(el('div', { class: 'title', style: 'font-size:14px;' }, ['Settings']));
  render(root, bar, content);
  void load(content, ctx);
}

async function load(content: HTMLElement, ctx: AppContext): Promise<void> {
  const [provRes, prefsRes] = await Promise.all([
    send({ type: 'settings/getProvider' }),
    send({ type: 'settings/getPrefs' }),
  ]);
  if (!prefsRes.ok) {
    render(content, errorCard(prefsRes.error, { onRetry: () => void load(content, ctx) }));
    return;
  }
  const existing = provRes.ok ? provRes.value : null;
  const draft: Draft = existing
    ? { provider: existing.provider, apiKey: existing.apiKey, model: existing.model, keyState: 'valid' }
    : { provider: 'anthropic', apiKey: '', model: defaultModel('anthropic'), keyState: 'unknown' };
  draw(content, ctx, prefsRes.value, draft);
}

function draw(content: HTMLElement, ctx: AppContext, prefs: Preferences, draft: Draft): void {
  render(
    content,
    el('div', { class: 'section-h' }, ['AI Provider']),
    providerGrid(content, ctx, prefs, draft),
    keyField(content, ctx, prefs, draft),
    modelField(draft),
    el('div', { class: 'section-h', style: 'margin-top:18px;' }, ['Preferences']),
    countryField(prefs, ctx),
    lengthField(prefs),
    themeRow(prefs),
    secureNote(),
    pageFooter(),
  );
}

function providerGrid(content: HTMLElement, ctx: AppContext, prefs: Preferences, draft: Draft): HTMLElement {
  const cells = PROVIDERS.map((p) =>
    el('button', {
      class: p.id === draft.provider ? 'provider on' : 'provider',
      'aria-pressed': p.id === draft.provider,
      onClick: () => {
        draft.provider = p.id;
        draft.model = defaultModel(p.id);
        draft.keyState = 'unknown';
        draw(content, ctx, prefs, draft);
      },
    }, [p.name]),
  );
  return el('div', { class: 'provider-grid', style: 'margin-bottom:14px;' }, cells);
}

function keyField(content: HTMLElement, ctx: AppContext, prefs: Preferences, draft: Draft): HTMLElement {
  let status = statusEl(draft);
  const input = el('input', {
    class: 'input', type: 'password', value: draft.apiKey, placeholder: 'Paste your API key', 'aria-label': 'API key',
    onInput: (e) => {
      draft.apiKey = (e.currentTarget as HTMLInputElement).value;
      draft.keyState = 'unknown';
      const next = statusEl(draft);
      status.replaceWith(next);
      status = next;
    },
  });

  const test = el('button', { class: 'act-btn', disabled: !draft.apiKey, onClick: () => void runTest(content, ctx, prefs, draft) }, ['Test key']);

  return el('div', { class: 'field' }, [
    el('label', {}, ['API Key']),
    input,
    el('div', { class: 'actions-row', style: 'margin-top:8px;' }, [test]),
    status,
  ]);
}

function statusEl(draft: Draft): HTMLElement {
  if (draft.keyState === 'valid') return el('div', { class: 'key-status' }, [icon('check', 14), el('span', {}, ['Key verified · stored locally, encrypted'])]);
  if (draft.keyState === 'invalid') return el('div', { class: 'key-status bad' }, [icon('x', 14), el('span', {}, ['Key rejected — check and try again'])]);
  if (draft.keyState === 'testing') return el('div', { class: 'key-status pending' }, ['Testing…']);
  return el('div', { class: 'key-status pending' }, ['Not verified yet']);
}

async function runTest(content: HTMLElement, ctx: AppContext, prefs: Preferences, draft: Draft): Promise<void> {
  draft.keyState = 'testing';
  draw(content, ctx, prefs, draft);
  const settings: ProviderSettings = { provider: draft.provider, apiKey: draft.apiKey, model: draft.model };
  const res = await send({ type: 'settings/testKey', settings });
  if (res.ok && res.value.valid) {
    draft.keyState = 'valid';
    await send({ type: 'settings/setProvider', settings });
    ctx.hasProvider = true;
  } else {
    draft.keyState = 'invalid';
  }
  draw(content, ctx, prefs, draft);
}

function modelField(draft: Draft): HTMLElement {
  const options = MODELS[draft.provider].map((m) =>
    el('option', { value: m.id }, [m.label]),
  );
  const select = el('select', { class: 'select', 'aria-label': 'Model' }, options);
  select.value = draft.model;
  select.addEventListener('change', () => { draft.model = select.value; });
  return el('div', { class: 'field' }, [el('label', {}, ['Model']), select]);
}

function countryField(prefs: Preferences, ctx: AppContext): HTMLElement {
  const options = COUNTRIES.map((c) => el('option', { value: c.code }, [c.name]));
  const select = el('select', { class: 'select', 'aria-label': 'Default country' }, options);
  select.value = prefs.country;
  select.addEventListener('change', () => {
    const next: Preferences = { ...prefs, country: select.value as CountryCode };
    ctx.country = next.country;
    void send({ type: 'settings/setPrefs', prefs: next });
  });
  return el('div', { class: 'field' }, [el('label', {}, ['Default country']), select]);
}

function lengthField(prefs: Preferences): HTMLElement {
  const options = SUMMARY_LENGTHS.map((s) => el('option', { value: s.type }, [s.label]));
  const select = el('select', { class: 'select', 'aria-label': 'Default summary length' }, options);
  select.value = prefs.defaultSummaryType;
  select.addEventListener('change', () => {
    void send({ type: 'settings/setPrefs', prefs: { ...prefs, defaultSummaryType: select.value as SummaryType } });
  });
  return el('div', { class: 'field' }, [el('label', {}, ['Default summary length']), select]);
}

const THEME_ORDER: readonly Preferences['theme'][] = ['auto', 'light', 'dark'];
const THEME_LABEL: Record<Preferences['theme'], string> = { auto: 'Auto (system)', light: 'Light', dark: 'Dark' };

function themeRow(prefs: Preferences): HTMLElement {
  const label = el('span', { class: 'hint', style: 'margin:0;' }, [THEME_LABEL[prefs.theme]]);
  const toggle = el('button', {
    class: prefs.theme === 'dark' ? 'toggle' : 'toggle off',
    'aria-label': `Dark mode: ${THEME_LABEL[prefs.theme]}`,
    onClick: () => {
      const idx = THEME_ORDER.indexOf(prefs.theme);
      const next = THEME_ORDER[(idx + 1) % THEME_ORDER.length] ?? 'auto';
      prefs = { ...prefs, theme: next };
      applyTheme(next);
      label.textContent = THEME_LABEL[next];
      toggle.className = next === 'dark' ? 'toggle' : 'toggle off';
      toggle.setAttribute('aria-label', `Dark mode: ${THEME_LABEL[next]}`);
      void send({ type: 'settings/setPrefs', prefs });
    },
  });
  return el('div', { class: 'pref-row' }, [
    'Dark mode',
    el('div', { style: 'display:flex; align-items:center; gap:8px;' }, [label, toggle]),
  ]);
}

function secureNote(): HTMLElement {
  return el('div', { class: 'secure-note' }, [
    icon('lock', 16),
    el('span', {}, ['Your API key never leaves this device. It is encrypted in Chrome storage and sent only to your chosen AI provider — never to SignalX servers.']),
  ]);
}
