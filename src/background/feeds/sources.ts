import type { Category, CountryCode } from '../../shared/contracts';
import {
  ABC_AU_CATEGORY,
  ALJAZEERA_CATEGORY,
  BBC_CATEGORY,
  CNA_CATEGORY,
  DW_CATEGORY,
  GUARDIAN_CATEGORY,
  HINDU_CATEGORY,
  HT_CATEGORY,
  IE_CATEGORY,
  NDTV_CATEGORY,
  NYT_CATEGORY,
  SMH_CATEGORY,
  ST_CATEGORY,
  TOI_FEED_IDS,
  WSJ_CATEGORY,
} from './nativeFeeds';

/**
 * Feed registry. Native publisher RSS wherever a stable feed exists (see
 * nativeFeeds.ts — all URLs verified live); the Google News site:-scoped query
 * only where no native feed is possible (CNN: rss.cnn.com TLS is broken;
 * Reuters: discontinued public RSS in 2020) or for the odd missing category.
 *
 * HARD RULE: a category feed must NEVER silently fall back to a source's
 * top/home feed. If a source has no category-specific feed for the requested
 * category, its `url()` returns null and the source is simply dropped for that
 * combo. Wrong content is worse than fewer sources.
 */

export interface FeedSource {
  readonly sourceId: string;
  readonly sourceName: string;
  /** Countries this source is offered for; 'all' = every country incl. GLOBAL. */
  readonly countries: 'all' | readonly CountryCode[];
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
 *   publisher- and category-specific.
 */
function googleNews(
  country: CountryCode,
  category: Category,
  siteDomain?: string,
): string | null {
  const term = CATEGORY_TERMS[category];
  if (category === 'top') {
    if (siteDomain) {
      const search = localeParams(country);
      search.set('q', `site:${siteDomain}`);
      return `${GOOGLE_NEWS}/search?${search.toString()}`;
    }
    return `${GOOGLE_NEWS}?${localeParams(country).toString()}`;
  }
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

function toiUrl(category: Category): string | null {
  const id = TOI_FEED_IDS[category];
  return id ? `https://timesofindia.indiatimes.com/rssfeeds/${id}.cms` : null;
}

/** The Guardian's `top` is edition-specific; category paths are shared. */
const GUARDIAN_TOP: Partial<Record<CountryCode, string>> = {
  GB: 'https://www.theguardian.com/uk/rss',
  AU: 'https://www.theguardian.com/au/rss',
};

function guardianUrl(country: CountryCode, category: Category): string | null {
  if (category === 'top') {
    return GUARDIAN_TOP[country] ?? 'https://www.theguardian.com/world/rss';
  }
  return GUARDIAN_CATEGORY[category] ?? null;
}

export const SOURCES: readonly FeedSource[] = [
  // ── Global wires/broadcasters (every country) ──
  {
    sourceId: 'bbc',
    sourceName: 'BBC',
    countries: 'all',
    url: (_country, category) => BBC_CATEGORY[category] ?? null,
  },
  {
    sourceId: 'cnn',
    sourceName: 'CNN',
    countries: 'all',
    // rss.cnn.com serves only plain http (TLS broken — verified 2026-06), so
    // CNN stays on the Google News proxy until CNN fixes its RSS host.
    url: (country, category) => googleNews(country, category, 'cnn.com'),
  },
  {
    sourceId: 'reuters',
    sourceName: 'Reuters',
    countries: 'all',
    // Reuters discontinued public RSS in 2020 — Google News proxy is the only
    // keyless option.
    url: (country, category) => googleNews(country, category, 'reuters.com'),
  },
  {
    sourceId: 'aljazeera',
    sourceName: 'Al Jazeera',
    countries: 'all',
    url: (_country, category) => ALJAZEERA_CATEGORY[category] ?? null,
  },
  {
    sourceId: 'dw',
    sourceName: 'DW',
    countries: 'all',
    url: (_country, category) => DW_CATEGORY[category] ?? null,
  },
  // ── US ──
  {
    sourceId: 'nyt',
    sourceName: 'The New York Times',
    countries: ['US', 'GLOBAL'],
    url: (_country, category) => NYT_CATEGORY[category] ?? null,
  },
  {
    sourceId: 'wsj',
    sourceName: 'The Wall Street Journal',
    countries: ['US', 'GLOBAL'],
    url: (_country, category) => WSJ_CATEGORY[category] ?? null,
  },
  // ── UK + AU (Guardian runs dedicated editions for both) ──
  {
    sourceId: 'guardian',
    sourceName: 'The Guardian',
    countries: ['GB', 'AU', 'GLOBAL'],
    url: guardianUrl,
  },
  // ── Australia ──
  {
    sourceId: 'abcau',
    sourceName: 'ABC News (AU)',
    countries: ['AU'],
    url: (_country, category) => ABC_AU_CATEGORY[category] ?? null,
  },
  {
    sourceId: 'smh',
    sourceName: 'Sydney Morning Herald',
    countries: ['AU'],
    url: (_country, category) => SMH_CATEGORY[category] ?? null,
  },
  // ── India ──
  {
    sourceId: 'toi',
    sourceName: 'Times of India',
    countries: ['IN'],
    url: (_country, category) => toiUrl(category),
  },
  {
    sourceId: 'ht',
    sourceName: 'Hindustan Times',
    countries: ['IN'],
    url: (country, category) =>
      HT_CATEGORY[category] ?? googleNews(country, category, 'hindustantimes.com'),
  },
  {
    sourceId: 'thehindu',
    sourceName: 'The Hindu',
    countries: ['IN'],
    url: (country, category) =>
      HINDU_CATEGORY[category] ?? googleNews(country, category, 'thehindu.com'),
  },
  {
    sourceId: 'ie',
    sourceName: 'Indian Express',
    countries: ['IN'],
    url: (_country, category) => IE_CATEGORY[category] ?? null,
  },
  {
    sourceId: 'ndtv',
    sourceName: 'NDTV',
    countries: ['IN'],
    url: (_country, category) => NDTV_CATEGORY[category] ?? null,
  },
  // ── Singapore ──
  {
    sourceId: 'cna',
    sourceName: 'CNA',
    countries: ['SG'],
    url: (_country, category) => CNA_CATEGORY[category] ?? null,
  },
  {
    sourceId: 'straitstimes',
    sourceName: 'The Straits Times',
    countries: ['SG'],
    url: (_country, category) => ST_CATEGORY[category] ?? null,
  },
];

/** Sources relevant to a country: global sources plus that country's locals. */
export function sourcesFor(country: CountryCode): readonly FeedSource[] {
  return SOURCES.filter(
    (s) => s.countries === 'all' || s.countries.includes(country),
  );
}
