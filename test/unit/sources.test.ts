import { describe, it, expect } from 'vitest';
import { SOURCES, sourcesFor, googleNewsSearch } from '../../src/background/feeds/sources';
import type { Category, CountryCode } from '../../src/shared/contracts';

const COUNTRIES: readonly CountryCode[] = ['IN', 'US', 'GB', 'AU', 'SG', 'AE', 'GLOBAL'];
const CATEGORIES: readonly Category[] = ['top', 'tech', 'business', 'politics', 'sports', 'world'];

/** URLs that represent a publisher's general/home/top feed (never allowed for a category). */
const HOME_FEED_URLS = new Set([
  'https://feeds.bbci.co.uk/news/rss.xml',
  'https://timesofindia.indiatimes.com/rssfeeds/1221656.cms',
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
    const gnSources = SOURCES.filter((s) => ['cnn', 'reuters', 'ht', 'thehindu', 'ie'].includes(s.sourceId));
    for (const source of gnSources) {
      const url = source.url('US', 'business');
      expect(url).not.toBeNull();
      const parsed = new URL(url as string);
      expect(parsed.searchParams.get('gl')).toBe('US');
    }
  });
});

describe('sourcesFor', () => {
  it('should keep all sources for India', () => {
    expect(sourcesFor('IN')).toHaveLength(SOURCES.length);
  });

  it('should drop India-only outlets for non-IN countries', () => {
    const ids = sourcesFor('US').map((s) => s.sourceId);
    expect(ids).not.toContain('toi');
    expect(ids).not.toContain('ht');
    expect(ids).toContain('bbc');
  });
});

describe('googleNewsSearch', () => {
  it('should build a country-scoped search URL for an arbitrary query', () => {
    const url = new URL(googleNewsSearch('delhi fire', 'IN'));
    expect(url.searchParams.get('q')).toBe('delhi fire');
    expect(url.searchParams.get('hl')).toBe('en-IN');
  });
});
