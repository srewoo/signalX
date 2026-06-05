/**
 * Settings / BYOK (prototype screen 11): provider grid, API key input with
 * "Test key" + verified status, per-provider model select, country select,
 * default summary length, dark-mode toggle (auto/light/dark), security note.
 */

import { el, render, setText } from '../lib/dom';
import { icon } from '../lib/icons';
import { backbar } from '../components/chrome';
import { errorCard } from '../components/errorCard';
import { pageFooter } from '../components/footer';
import { COUNTRIES, SUMMARY_LENGTHS, PROVIDERS, MODELS, defaultModel, provider as providerInfo } from '../lib/catalog';
import { applyTheme } from '../lib/theme';
import { send } from '../lib/messaging';
import { navigate, onLeave, type AppContext } from '../router';
import type { Preferences, ProviderId, ProviderSettings, SummaryType, CountryCode } from '../../shared/contracts';

type ModelOption = { readonly id: string; readonly label: string };

interface Draft {
  provider: ProviderId;
  apiKey: string;
  model: string;
  keyState: 'unknown' | 'testing' | 'valid' | 'invalid';
  /**
   * Whether a key is already stored in the background for this provider. The
   * panel never receives the key itself; with hasKey we can list models /
   * persist model changes (background supplies the stored key) and show the
   * "verified" state without holding the secret. Reset to false on provider switch.
   */
  hasKey: boolean;
  /** Monotonic token to discard stale listModels responses across provider switches. */
  modelSeq: number;
}

export function renderSettings(root: HTMLElement, ctx: AppContext): void {
  const content = el('div', { class: 'content' });
  const bar = backbar('Back', () => navigate({ view: 'feed' }));
  bar.appendChild(el('div', { class: 'title', style: 'font-size:14px;' }, ['Settings']));
  render(root, bar, content);
  // Drop the module-level reference to this screen's model field on leave so a
  // late listModels response can't write into detached nodes (and the nodes GC).
  onLeave(() => { activeModelField = null; });
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
    ? { provider: existing.provider, apiKey: '', model: existing.model, keyState: 'valid', hasKey: existing.hasKey, modelSeq: 0 }
    : { provider: 'anthropic', apiKey: '', model: defaultModel('anthropic'), keyState: 'unknown', hasKey: false, modelSeq: 0 };
  draw(content, ctx, prefsRes.value, draft);
  // Trigger point (b): a verified provider config exists on load → fetch live
  // models using the stored key (resolved server-side; panel holds no key).
  if (existing && existing.hasKey) void refreshModels(draft);
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
        // A different provider needs its own key; the stored one doesn't apply.
        draft.hasKey = false;
        draft.apiKey = '';
        // Invalidate any in-flight model fetch for the previous provider.
        draft.modelSeq += 1;
        draw(content, ctx, prefs, draft);
        // Trigger point (c): provider changed and a key is present (1h-cached upstream).
        if (draft.apiKey.length > 0) void refreshModels(draft);
      },
    }, [p.name]),
  );
  return el('div', { class: 'provider-grid', style: 'margin-bottom:14px;' }, cells);
}

function keyField(content: HTMLElement, ctx: AppContext, prefs: Preferences, draft: Draft): HTMLElement {
  let status = statusEl(draft);
  const test = el('button', { class: 'act-btn', disabled: !draft.apiKey, onClick: () => void runTest(content, ctx, prefs, draft) }, ['Test key']);
  const input = el('input', {
    class: 'input', type: 'password', value: draft.apiKey,
    placeholder: draft.hasKey ? 'Key saved — paste a new key to replace' : 'Paste your API key',
    'aria-label': 'API key',
    onInput: (e) => {
      draft.apiKey = (e.currentTarget as HTMLInputElement).value;
      draft.keyState = 'unknown';
      // Keep the Test button's enabled state in sync with the typed key —
      // it was previously frozen at initial-render time (dead button bug).
      test.disabled = draft.apiKey.length === 0;
      const next = statusEl(draft);
      status.replaceWith(next);
      status = next;
    },
  });

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
    draft.hasKey = true;
    await send({ type: 'settings/setProvider', settings });
    ctx.hasProvider = true;
    draw(content, ctx, prefs, draft);
    // Trigger point (a): key just verified → populate the live model list.
    void refreshModels(draft);
    return;
  }
  draft.keyState = 'invalid';
  draw(content, ctx, prefs, draft);
}

/** Live handles to the current model field; refreshModels() targets these. */
interface ModelFieldHandle {
  readonly select: HTMLSelectElement;
  readonly hint: HTMLElement;
  readonly draft: Draft;
}
let activeModelField: ModelFieldHandle | null = null;

/** Build an <option> with its value set as a DOM property (dom.el skips option value). */
function modelOption(opt: ModelOption): HTMLOptionElement {
  const node = el('option', {}, [opt.label]);
  node.value = opt.id;
  return node;
}

/**
 * Replace the select's options with `list`, preserving the current selection if
 * still present (else the first). A stored model absent from `list` is injected
 * at the top, labelled "<id> (saved)", so the saved choice never disappears.
 * Returns the model id now selected.
 */
function fillSelect(select: HTMLSelectElement, list: readonly ModelOption[], current: string): string {
  const present = list.some((m) => m.id === current);
  const opts: ModelOption[] = [];
  if (!present && current.length > 0) opts.push({ id: current, label: `${current} (saved)` });
  for (const m of list) opts.push(m);
  render(select, ...opts.map(modelOption));
  const selected = present || current.length === 0 ? current || (list[0]?.id ?? '') : current;
  select.value = selected;
  return select.value;
}

function modelField(draft: Draft): HTMLElement {
  const select = el('select', { class: 'select', 'aria-label': 'Model' }, []);
  fillSelect(select, MODELS[draft.provider], draft.model);
  select.addEventListener('change', () => {
    draft.model = select.value;
    persistIfVerified(draft);
  });

  const hint = el('div', { class: 'hint', style: 'margin-top:6px;' }, []);

  const refresh = el('button', {
    class: 'fb-btn',
    'aria-label': 'Refresh model list',
    title: 'Refresh model list',
    onClick: () => void refreshModels(draft),
  }, [icon('refresh-cw', 14)]);

  const labelRow = el('div', { style: 'display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;' }, [
    el('label', { style: 'margin:0;' }, ['Model']),
    refresh,
  ]);

  activeModelField = { select, hint, draft };
  return el('div', { class: 'field' }, [labelRow, select, hint]);
}

/** Auto-save: persist a model change immediately when the key is verified. */
function persistIfVerified(draft: Draft): void {
  if (draft.keyState !== 'valid') return;
  void send({
    type: 'settings/setProvider',
    settings: { provider: draft.provider, apiKey: draft.apiKey, model: draft.model },
  });
}

/**
 * Fetch the live model list and reconcile the active select. Guards against
 * stale responses: a sequence token captured at call time is compared against
 * the draft's current token (bumped on provider switch) when the response lands.
 */
async function refreshModels(draft: Draft): Promise<void> {
  const handle = activeModelField;
  // Need either a freshly typed key or a stored key (background supplies it).
  if (!handle || handle.draft !== draft || (draft.apiKey.length === 0 && !draft.hasKey)) return;

  const seq = (draft.modelSeq += 1);
  setText(handle.hint, 'Loading available models…');

  const res = await send({
    type: 'settings/listModels',
    settings: { provider: draft.provider, apiKey: draft.apiKey, model: draft.model },
  });

  // Discard if the user switched provider (seq bumped) or the field was redrawn.
  if (draft.modelSeq !== seq || activeModelField !== handle) return;

  const providerName = providerInfo(draft.provider).name;
  if (res.ok && res.value.source === 'live') {
    const before = draft.model;
    const now = fillSelect(handle.select, res.value.models, draft.model);
    setText(handle.hint, `${res.value.models.length} models available from ${providerName}`);
    // Auto-correct: the stored model vanished from the live list — persist the
    // new selection so the saved config stays consistent with what's shown.
    if (now !== before) {
      draft.model = now;
      persistIfVerified(draft);
    }
    return;
  }

  // Fallback (or transport error): restore the static catalog defaults.
  fillSelect(handle.select, MODELS[draft.provider], draft.model);
  setText(handle.hint, 'Couldn’t fetch live model list — showing defaults.');
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
