/**
 * Tiny DOM helpers. RSS titles and LLM output are UNTRUSTED — dynamic text is
 * only ever applied via textContent (never innerHTML), so these helpers cannot
 * introduce XSS by construction.
 */

type Child = Node | string | null | undefined | false;

export interface ElAttrs {
  readonly class?: string;
  readonly id?: string;
  readonly type?: string;
  readonly value?: string;
  readonly placeholder?: string;
  readonly title?: string;
  readonly href?: string;
  readonly disabled?: boolean;
  readonly readonly?: boolean;
  readonly 'aria-label'?: string;
  readonly 'aria-pressed'?: boolean;
  readonly 'aria-selected'?: boolean;
  readonly 'aria-live'?: 'polite' | 'assertive';
  readonly role?: string;
  readonly tabindex?: number;
  /** Inline style is reserved for genuinely dynamic values (e.g. skeleton width). */
  readonly style?: string;
  readonly onClick?: (e: MouseEvent) => void;
  readonly onInput?: (e: Event) => void;
  readonly onKeyDown?: (e: KeyboardEvent) => void;
}

/** Create an element. All string children are inserted as text nodes (safe). */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: ElAttrs = {},
  children: readonly Child[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  applyAttrs(node, attrs);
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

function applyAttrs(node: HTMLElement, attrs: ElAttrs): void {
  if (attrs.class !== undefined) node.className = attrs.class;
  if (attrs.id !== undefined) node.id = attrs.id;
  if (attrs.title !== undefined) node.title = attrs.title;
  if (attrs.role !== undefined) node.setAttribute('role', attrs.role);
  if (attrs.style !== undefined) node.setAttribute('style', attrs.style);
  if (attrs.tabindex !== undefined) node.tabIndex = attrs.tabindex;
  if (attrs['aria-label'] !== undefined) node.setAttribute('aria-label', attrs['aria-label']);
  if (attrs['aria-pressed'] !== undefined) node.setAttribute('aria-pressed', String(attrs['aria-pressed']));
  if (attrs['aria-selected'] !== undefined) node.setAttribute('aria-selected', String(attrs['aria-selected']));
  if (attrs['aria-live'] !== undefined) node.setAttribute('aria-live', attrs['aria-live']);
  applyFormAttrs(node, attrs);
  if (attrs.onClick) node.addEventListener('click', attrs.onClick as EventListener);
  if (attrs.onInput) node.addEventListener('input', attrs.onInput);
  if (attrs.onKeyDown) node.addEventListener('keydown', attrs.onKeyDown as EventListener);
}

function applyFormAttrs(node: HTMLElement, attrs: ElAttrs): void {
  if (node instanceof HTMLInputElement) {
    if (attrs.type !== undefined) node.type = attrs.type;
    if (attrs.value !== undefined) node.value = attrs.value;
    if (attrs.placeholder !== undefined) node.placeholder = attrs.placeholder;
    if (attrs.readonly !== undefined) node.readOnly = attrs.readonly;
  }
  // <option> needs its value set as a property too — without this, options fall
  // back to their text content as value, so select.value never matches enum
  // codes ('IN', 'short') and preference selects render blank and fail to save.
  if (node instanceof HTMLOptionElement && attrs.value !== undefined) {
    node.value = attrs.value;
  }
  if (node instanceof HTMLAnchorElement && attrs.href !== undefined) node.href = attrs.href;
  if (
    (node instanceof HTMLButtonElement ||
      node instanceof HTMLInputElement ||
      node instanceof HTMLSelectElement) &&
    attrs.disabled !== undefined
  ) {
    node.disabled = attrs.disabled;
  }
}

/** Remove every child of a node. */
export function clear(node: Node): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

/** Replace the entire content of a node with new children. */
export function render(node: Node, ...children: readonly Child[]): void {
  clear(node);
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
}

/** Safe text setter — the only sanctioned way to put dynamic strings in the DOM. */
export function setText(node: HTMLElement, text: string): void {
  node.textContent = text;
}
