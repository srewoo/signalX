import { describe, it, expect } from 'vitest';
import { SOURCES, sourcesFor, googleNewsSearch } from '../../src/background/feeds/sources';
import type { Category, CountryCode } from '../../src/shared/contracts';

const COUNTRIES: readonly CountryCode[] = ['IN', 'US', 'GB', 'AU', 'SG', 'AE', 'GLOBAL'];
const CATEGORIES: readonly Category[] = ['top', 'tech', 'business', 'politics', 'sports', 'world'];

/** URLs that represent a publisher's general/home/top feed (never allowed for a category). */
const HOME_FEED_URLS = new Set([
  'https://feeds.bbci.co.uk/news/rss.xml',
  'https://timesofindia.indiatimes.com/rssfeeds/1221656.cms',
  'https://www.hindustantimes.com/feeds/rss/latest/rssfeed.xml',
  'https://www.thehindu.com/news/feeder/default.rss',
  'https://indianexpress.com/feed/',
  'https://feeds.feedburner.com/ndtvnews-top-stories',
  'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml',
  'https://feeds.a.dj.com/rss/RSSWorldNews.xml',
  'https://www.theguardian.com/uk/rss',
  'https://www.theguardian.com/au/rss',
  'https://www.smh.com.au/rss/feed.xml',
  'https://www.abc.net.au/news/feed/51120/rss.xml',
  'https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml',
  'https://www.straitstimes.com/news/singapore/rss.xml',
  'https://www.aljazeera.com/xml/rss/all.xml',
  'https://rss.dw.com/rdf/rss-en-all',
]);

describe('feed sources — category awareness (BUG 1)', () => {
  it('should produce a sports URL different from the top URL for every registered source', () => {
    for (const source of SOURCES) {
      const top = source.url('IN', 'top');
      const sports = source.url('IN', 'sports');
      // Both must exist for this source to be comparable; if sports is null the
      // source is simply dropped (acceptable), but if present it must differ.
      if (sports !== null && top !== null) {
        expect(sports, `${source.sourceId} sports must differ from top`).not.toBe(top);
      }
    }
  });

  it('should never resolve any category to a home/top feed URL', () => {
    const nonTop = CATEGORIES.filter((c) => c !== 'top');
    for (const source of SOURCES) {
      for (const country of COUNTRIES) {
        for (const category of nonTop) {
          const url = source.url(country, category);
          if (url === null) continue;
          expect(
            HOME_FEED_URLS.has(url),
            `${source.sourceId} ${country}/${category} resolved to a home feed: ${url}`,
          ).toBe(false);
        }
      }
    }
  });

  it('should map BBC sports to the dedicated /sport/ RSS path, not /news/', () => {
    const bbc = SOURCES.find((s) => s.sourceId === 'bbc');
    expect(bbc?.url('GB', 'sports')).toBe('https://feeds.bbci.co.uk/sport/rss.xml');
  });

  it('should map Times of India sports to the known stable feed id 4719148', () => {
    const toi = SOURCES.find((s) => s.sourceId === 'toi');
    expect(toi?.url('IN', 'sports')).toBe('https://timesofindia.indiatimes.com/rssfeeds/4719148.cms');
  });

  it('should omit Times of India for politics rather than serve its top feed', () => {
    const toi = SOURCES.find((s) => s.sourceId === 'toi');
    expect(toi?.url('IN', 'politics')).toBeNull();
  });

  it('should scope Google-News-backed sources by BOTH site: and category term with country params', () => {
    const reuters = SOURCES.find((s) => s.sourceId === 'reuters');
    const url = reuters?.url('IN', 'sports') ?? '';
    const parsed = new URL(url);
    expect(parsed.searchParams.get('q')).toContain('site:reuters.com');
    expect(parsed.searchParams.get('q')).toContain('sports');
    expect(parsed.searchParams.get('gl')).toBe('IN');
    expect(parsed.searchParams.get('ceid')).toBe('IN:en');
  });

  it('should carry country-specific locale params for every Google-News source/category', () => {
    const gnSources = SOURCES.filter((s) => ['cnn', 'reuters'].includes(s.sourceId));
    for (const source of gnSources) {
      const url = source.url('US', 'business');
      expect(url).not.toBeNull();
      const parsed = new URL(url as string);
      expect(parsed.searchParams.get('gl')).toBe('US');
    }
  });
});

describe('feed sources — native publisher RSS (Google News de-proxying)', () => {
  const nativeCases: readonly { id: string; host: string }[] = [
    { id: 'ht', host: 'www.hindustantimes.com' },
    { id: 'thehindu', host: 'www.thehindu.com' },
    { id: 'ie', host: 'indianexpress.com' },
  ];

  it('should serve tech/business/sports/world from native publisher hosts, not Google News', () => {
    for (const { id, host } of nativeCases) {
      const source = SOURCES.find((s) => s.sourceId === id);
      for (const category of ['tech', 'business', 'sports', 'world'] as const) {
        const url = source?.url('IN', category);
        expect(url, `${id}/${category} must resolve`).not.toBeNull();
        expect(new URL(url as string).hostname, `${id}/${category} must be native`).toBe(host);
      }
    }
  });

  it('should fall back to a Google News site: query (not null, not home) for HT/Hindu politics', () => {
    for (const id of ['ht', 'thehindu']) {
      const source = SOURCES.find((s) => s.sourceId === id);
      const url = source?.url('IN', 'politics') ?? '';
      const parsed = new URL(url);
      expect(parsed.hostname).toBe('news.google.com');
      expect(parsed.searchParams.get('q')).toContain('politics');
      expect(parsed.searchParams.get('q')).toContain('site:');
    }
  });

  it('should serve Indian Express politics from its native political-pulse feed', () => {
    const ie = SOURCES.find((s) => s.sourceId === 'ie');
    expect(ie?.url('IN', 'politics')).toBe('https://indianexpress.com/section/political-pulse/feed/');
  });
});

describe('sourcesFor — per-country rosters', () => {
  const GLOBAL_IDS = ['bbc', 'cnn', 'reuters', 'aljazeera', 'dw'];

  it('should include the global sources for every country', () => {
    for (const country of COUNTRIES) {
      const ids = sourcesFor(country).map((s) => s.sourceId);
      for (const id of GLOBAL_IDS) {
        expect(ids, `${country} must include ${id}`).toContain(id);
      }
    }
  });

  it('should add Indian outlets only for India', () => {
    const inIds = sourcesFor('IN').map((s) => s.sourceId);
    for (const id of ['toi', 'ht', 'thehindu', 'ie', 'ndtv']) expect(inIds).toContain(id);
    const usIds = sourcesFor('US').map((s) => s.sourceId);
    expect(usIds).not.toContain('toi');
    expect(usIds).not.toContain('ndtv');
  });

  it('should add NYT and WSJ for the US', () => {
    const ids = sourcesFor('US').map((s) => s.sourceId);
    expect(ids).toContain('nyt');
    expect(ids).toContain('wsj');
    expect(sourcesFor('IN').map((s) => s.sourceId)).not.toContain('nyt');
  });

  it('should add the Guardian for GB and AU', () => {
    expect(sourcesFor('GB').map((s) => s.sourceId)).toContain('guardian');
    expect(sourcesFor('AU').map((s) => s.sourceId)).toContain('guardian');
    expect(sourcesFor('US').map((s) => s.sourceId)).not.toContain('guardian');
  });

  it('should add ABC and SMH for Australia only', () => {
    const auIds = sourcesFor('AU').map((s) => s.sourceId);
    expect(auIds).toContain('abcau');
    expect(auIds).toContain('smh');
    expect(sourcesFor('GB').map((s) => s.sourceId)).not.toContain('smh');
  });

  it('should add CNA and Straits Times for Singapore only', () => {
    const sgIds = sourcesFor('SG').map((s) => s.sourceId);
    expect(sgIds).toContain('cna');
    expect(sgIds).toContain('straitstimes');
    expect(sourcesFor('US').map((s) => s.sourceId)).not.toContain('cna');
  });

  it('should give every country at least 5 sources for the top category', () => {
    for (const country of COUNTRIES) {
      const withTop = sourcesFor(country).filter((s) => s.url(country, 'top') !== null);
      expect(withTop.length, `${country} top roster too small`).toBeGreaterThanOrEqual(5);
    }
  });
});

describe('the Guardian — edition-aware top feed', () => {
  const guardian = SOURCES.find((s) => s.sourceId === 'guardian');

  it('should serve the UK edition for GB and the AU edition for Australia', () => {
    expect(guardian?.url('GB', 'top')).toBe('https://www.theguardian.com/uk/rss');
    expect(guardian?.url('AU', 'top')).toBe('https://www.theguardian.com/au/rss');
  });

  it('should fall back to the world feed for other countries', () => {
    expect(guardian?.url('GLOBAL', 'top')).toBe('https://www.theguardian.com/world/rss');
  });
});

describe('googleNewsSearch', () => {
  it('should build a country-scoped search URL for an arbitrary query', () => {
    const url = new URL(googleNewsSearch('delhi fire', 'IN'));
    expect(url.searchParams.get('q')).toBe('delhi fire');
    expect(url.searchParams.get('hl')).toBe('en-IN');
  });
});
