import type { Article } from '../../shared/contracts';
import { stableHash } from '../hash';
import { log } from '../logger';

/**
 * Defensive RSS/Atom parsing WITHOUT DOMParser (unavailable in MV3 service
 * workers). Extracts items via regex, validates every field, and skips any
 * malformed entry rather than throwing.
 */

const FETCH_TIMEOUT_MS = 8000;
const MAX_ITEMS_PER_FEED = 40;

export interface RawFeedItem {
  readonly article: Article;
}

const ITEM_RE = /<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi;

/** Reuters/CNN proxied via Google News wrap the real source in the title suffix. */
function tagContent(block: string, tag: string): string | null {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const m = re.exec(block);
  return m && m[1] !== undefined ? m[1] : null;
}

/** Atom <link href="..."/> or RSS <link>...</link>. */
function extractLink(block: string): string | null {
  const hrefRe = /<link\b[^>]*href=["']([^"']+)["'][^>]*\/?>/i;
  const hrefM = hrefRe.exec(block);
  if (hrefM && hrefM[1]) return hrefM[1];
  const textLink = tagContent(block, 'link');
  return textLink ? textLink.trim() : null;
}

function decodeEntities(input: string): string {
  return input
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_m, code: string) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, ' ')
    .trim();
}

function parseDate(raw: string | null): string | null {
  if (!raw) return null;
  const cleaned = decodeEntities(raw);
  const t = Date.parse(cleaned);
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString();
}

/**
 * Parse one feed body into Articles. `sourceId`/`sourceName` are the registry
 * defaults; Google-News-proxied items override the display name from the
 * trailing " - Publisher" convention in the title.
 */
export function parseFeed(
  xml: string,
  sourceId: string,
  sourceName: string,
): readonly Article[] {
  const out: Article[] = [];
  let match: RegExpExecArray | null;
  ITEM_RE.lastIndex = 0;
  while ((match = ITEM_RE.exec(xml)) !== null && out.length < MAX_ITEMS_PER_FEED) {
    const block = match[2];
    if (!block) continue;
    const rawTitle = tagContent(block, 'title');
    const rawLink = extractLink(block);
    if (!rawTitle || !rawLink) continue;

    let title = decodeEntities(rawTitle);
    const url = decodeEntities(rawLink);
    if (!title || !/^https?:\/\//i.test(url)) continue;

    let displayName = sourceName;
    const dashIdx = title.lastIndexOf(' - ');
    if (dashIdx > 0 && title.length - dashIdx < 60) {
      displayName = title.slice(dashIdx + 3).trim() || sourceName;
      title = title.slice(0, dashIdx).trim();
    }

    const publishedAt =
      parseDate(tagContent(block, 'pubDate')) ??
      parseDate(tagContent(block, 'published')) ??
      parseDate(tagContent(block, 'updated')) ??
      new Date().toISOString();

    const rawSnippet = tagContent(block, 'description') ?? tagContent(block, 'summary');
    const snippet = rawSnippet ? decodeEntities(rawSnippet).slice(0, 280) : '';

    out.push({
      id: stableHash(url),
      title,
      url,
      sourceId,
      sourceName: displayName,
      publishedAt,
      ...(snippet ? { snippet } : {}),
    });
  }
  return out;
}

export interface FetchFeedResult {
  readonly articles: readonly Article[];
  readonly failed: boolean;
}

/** Fetch and parse a single feed. Never throws; returns failed:true on error. */
export async function fetchFeed(
  url: string,
  sourceId: string,
  sourceName: string,
): Promise<FetchFeedResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' },
    });
    if (!res.ok) {
      log.warn('feed http error', { sourceId, status: res.status });
      return { articles: [], failed: true };
    }
    const xml = await res.text();
    return { articles: parseFeed(xml, sourceId, sourceName), failed: false };
  } catch (e) {
    log.warn('feed fetch failed', { sourceId, reason: e instanceof Error ? e.name : 'unknown' });
    return { articles: [], failed: true };
  } finally {
    clearTimeout(timer);
  }
}
