import type { Category, CountryCode } from '../../shared/contracts';

/**
 * Feed registry. Each source produces an RSS/Atom URL for a given country +
 * category. Some publishers expose stable per-category RSS paths (BBC, Times of
 * India); for the rest we build a Google News RSS query scoped to BOTH the
 * publisher domain AND a category search term so the result is genuinely
 * category-specific.
 *
 * HARD RULE: a category feed must NEVER silently fall back to a source's
 * top/home feed. If a source has no category-specific feed for the requested
 * category, its `url()` returns null and the source is simply dropped for that
 * combo. Wrong content is worse than fewer sources.
 */

export interface FeedSource {
  readonly sourceId: string;
  readonly sourceName: string;
  /** Returns an RSS/Atom URL, or null if this source has no feed for the combo. */
  readonly url: (country: CountryCode, category: Category) => string | null;
}

const GOOGLE_NEWS = 'https://news.google.com/rss';

const GN_LANG: Record<CountryCode, { hl: string; gl: string; ceid: string }> = {
  IN: { hl: 'en-IN', gl: 'IN', ceid: 'IN:en' },
  US: { hl: 'en-US', gl: 'US', ceid: 'US:en' },
  GB: { hl: 'en-GB', gl: 'GB', ceid: 'GB:en' },
  AU: { hl: 'en-AU', gl: 'AU', ceid: 'AU:en' },
  SG: { hl: 'en-SG', gl: 'SG', ceid: 'SG:en' },
  AE: { hl: 'en-AE', gl: 'AE', ceid: 'AE:en' },
  GLOBAL: { hl: 'en-US', gl: 'US', ceid: 'US:en' },
};

/**
 * Category search term injected into Google-News-scoped queries. `top` has no
 * term — the only category that legitimately maps to a publisher's general
 * feed. Every other category MUST carry a term so the query is specific.
 */
const CATEGORY_TERMS: Record<Category, string> = {
  top: '',
  tech: 'technology',
  business: 'business',
  politics: 'politics',
  sports: 'sports',
  world: 'world',
};

/** Build the country-scoped (hl/gl/ceid) params shared by all Google News URLs. */
function localeParams(country: CountryCode): URLSearchParams {
  const loc = GN_LANG[country];
  return new URLSearchParams({ hl: loc.hl, gl: loc.gl, ceid: loc.ceid });
}

/**
 * Build a Google News RSS URL scoped to a publisher domain AND category term.
 *
 * - `top` + no domain → the country's general top feed (the ONE allowed
 *   "home feed" case, used only by the dedicated top-feed source).
 * - any other category → a `site:<domain> <term>` search, so the feed is both
 *   publisher- and category-specific. Returns null if the category has no term
 *   (only `top`), which keeps the never-fall-back-to-home invariant.
 */
function googleNews(
  country: CountryCode,
  category: Category,
  siteDomain?: string,
): string | null {
  const term = CATEGORY_TERMS[category];
  if (category === 'top') {
    if (siteDomain) {
      // A publisher "top" via Google News: scope to the domain only.
      const search = localeParams(country);
      search.set('q', `site:${siteDomain}`);
      return `${GOOGLE_NEWS}/search?${search.toString()}`;
    }
    return `${GOOGLE_NEWS}?${localeParams(country).toString()}`;
  }
  // Non-top category: a term is guaranteed by CATEGORY_TERMS.
  const queryParts = [term];
  if (siteDomain) queryParts.push(`site:${siteDomain}`);
  const search = localeParams(country);
  search.set('q', queryParts.join(' '));
  return `${GOOGLE_NEWS}/search?${search.toString()}`;
}

/** Build a Google News search RSS URL for an arbitrary user query. */
export function googleNewsSearch(query: string, country: CountryCode): string {
  const params = localeParams(country);
  params.set('q', query);
  return `${GOOGLE_NEWS}/search?${params.toString()}`;
}

/**
 * BBC native RSS paths. Sport lives under a different root (/sport/rss.xml),
 * everything else under /news/<section>/rss.xml. `world` maps to the world
 * section. Categories absent here (none currently) resolve to null, not top.
 */
const BBC_CATEGORY: Partial<Record<Category, string>> = {
  top: 'https://feeds.bbci.co.uk/news/rss.xml',
  tech: 'https://feeds.bbci.co.uk/news/technology/rss.xml',
  business: 'https://feeds.bbci.co.uk/news/business/rss.xml',
  politics: 'https://feeds.bbci.co.uk/news/politics/rss.xml',
  world: 'https://feeds.bbci.co.uk/news/world/rss.xml',
  sports: 'https://feeds.bbci.co.uk/sport/rss.xml',
};

/**
 * Times of India native RSS feed ids (timesofindia.indiatimes.com/rssfeeds/<id>.cms).
 * Known-stable section ids only; categories without a stable id are omitted so
 * TOI is dropped for them rather than serving its top feed.
 */
const TOI_FEED_IDS: Partial<Record<Category, string>> = {
  top: '1221656',        // Top Stories
  tech: '66949542',      // Technology / Gadgets
  business: '1898055',   // Business
  sports: '4719148',     // Sports
  world: '296589292',    // World
  // politics: omitted — no stable standalone TOI politics feed id.
};

function toiUrl(category: Category): string | null {
  const id = TOI_FEED_IDS[category];
  return id ? `https://timesofindia.indiatimes.com/rssfeeds/${id}.cms` : null;
}

export const SOURCES: readonly FeedSource[] = [
  {
    sourceId: 'bbc',
    sourceName: 'BBC',
    // No fallback to top: unknown category → null (source dropped for that combo).
    url: (_country, category) => BBC_CATEGORY[category] ?? null,
  },
  {
    sourceId: 'cnn',
    sourceName: 'CNN',
    url: (country, category) => googleNews(country, category, 'cnn.com'),
  },
  {
    sourceId: 'reuters',
    sourceName: 'Reuters',
    url: (country, category) => googleNews(country, category, 'reuters.com'),
  },
  {
    sourceId: 'toi',
    sourceName: 'Times of India',
    // Native TOI RSS where a stable section id exists; null otherwise.
    url: (_country, category) => toiUrl(category),
  },
  {
    sourceId: 'ht',
    sourceName: 'Hindustan Times',
    // No reliably-stable per-category RSS paths → Google News scoped by site + term.
    url: (country, category) => googleNews(country, category, 'hindustantimes.com'),
  },
  {
    sourceId: 'thehindu',
    sourceName: 'The Hindu',
    url: (country, category) => googleNews(country, category, 'thehindu.com'),
  },
  {
    sourceId: 'ie',
    sourceName: 'Indian Express',
    url: (country, category) => googleNews(country, category, 'indianexpress.com'),
  },
];

const INDIA_ONLY = new Set(['toi', 'ht', 'thehindu', 'ie']);

/** Sources relevant to a country: drop India-only outlets for non-IN feeds. */
export function sourcesFor(country: CountryCode): readonly FeedSource[] {
  if (country === 'IN') return SOURCES;
  return SOURCES.filter((s) => !INDIA_ONLY.has(s.sourceId));
}
