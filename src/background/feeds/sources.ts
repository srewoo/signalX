import type { Category, CountryCode } from '../../shared/contracts';

/**
 * Feed registry. Each source produces an RSS/Atom URL for a given country +
 * category. Reuters has no stable public RSS, so we fall back to a Google News
 * RSS query scoped to reuters.com — the same pattern covers any publisher.
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

const CATEGORY_TERMS: Record<Category, string> = {
  top: '',
  tech: 'technology',
  business: 'business',
  politics: 'politics',
  sports: 'sports',
  world: 'world',
};

/** Build a Google News RSS URL, optionally scoped to a publisher domain. */
function googleNews(
  country: CountryCode,
  category: Category,
  siteDomain?: string,
): string {
  const loc = GN_LANG[country];
  const term = CATEGORY_TERMS[category];
  const params = new URLSearchParams({ hl: loc.hl, gl: loc.gl, ceid: loc.ceid });
  if (!siteDomain && category === 'top') {
    return `${GOOGLE_NEWS}?${params.toString()}`;
  }
  const queryParts: string[] = [];
  if (term) queryParts.push(term);
  if (siteDomain) queryParts.push(`site:${siteDomain}`);
  const search = new URLSearchParams({
    q: queryParts.join(' ') || 'news',
    hl: loc.hl,
    gl: loc.gl,
    ceid: loc.ceid,
  });
  return `${GOOGLE_NEWS}/search?${search.toString()}`;
}

/** Build a Google News search RSS URL for an arbitrary user query. */
export function googleNewsSearch(query: string, country: CountryCode): string {
  const loc = GN_LANG[country];
  const params = new URLSearchParams({
    q: query,
    hl: loc.hl,
    gl: loc.gl,
    ceid: loc.ceid,
  });
  return `${GOOGLE_NEWS}/search?${params.toString()}`;
}

const BBC_CATEGORY: Partial<Record<Category, string>> = {
  top: 'https://feeds.bbci.co.uk/news/rss.xml',
  tech: 'https://feeds.bbci.co.uk/news/technology/rss.xml',
  business: 'https://feeds.bbci.co.uk/news/business/rss.xml',
  politics: 'https://feeds.bbci.co.uk/news/politics/rss.xml',
  world: 'https://feeds.bbci.co.uk/news/world/rss.xml',
};

export const SOURCES: readonly FeedSource[] = [
  {
    sourceId: 'bbc',
    sourceName: 'BBC',
    url: (_country, category) => BBC_CATEGORY[category] ?? BBC_CATEGORY.top ?? null,
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
    url: (country, category) => googleNews(country, category, 'timesofindia.indiatimes.com'),
  },
  {
    sourceId: 'ht',
    sourceName: 'Hindustan Times',
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
