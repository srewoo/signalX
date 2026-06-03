import type { Category } from '../../shared/contracts';

/**
 * Native per-category RSS catalogs, one map per publisher. Every URL here was
 * verified live (2026-06) — dead or empty endpoints are deliberately omitted
 * rather than guessed (NYT sports: empty feed; WSJ politics: 403;
 * Straits Times tech: 400). Categories absent from a map resolve to null in
 * the registry — never a silent fallback to a home feed.
 *
 * Native feeds carry real publisher article URLs, unlike the Google News
 * proxy whose links are news.google.com redirects — prefer native always.
 */

export const BBC_CATEGORY: Partial<Record<Category, string>> = {
  top: 'https://feeds.bbci.co.uk/news/rss.xml',
  tech: 'https://feeds.bbci.co.uk/news/technology/rss.xml',
  business: 'https://feeds.bbci.co.uk/news/business/rss.xml',
  politics: 'https://feeds.bbci.co.uk/news/politics/rss.xml',
  world: 'https://feeds.bbci.co.uk/news/world/rss.xml',
  sports: 'https://feeds.bbci.co.uk/sport/rss.xml',
};

/** TOI rssfeeds/<id>.cms — known-stable section ids only (no politics feed). */
export const TOI_FEED_IDS: Partial<Record<Category, string>> = {
  top: '1221656',
  tech: '66949542',
  business: '1898055',
  sports: '4719148',
  world: '296589292',
};

export const HT_CATEGORY: Partial<Record<Category, string>> = {
  top: 'https://www.hindustantimes.com/feeds/rss/latest/rssfeed.xml',
  tech: 'https://www.hindustantimes.com/feeds/rss/technology/rssfeed.xml',
  business: 'https://www.hindustantimes.com/feeds/rss/business/rssfeed.xml',
  sports: 'https://www.hindustantimes.com/feeds/rss/sports/rssfeed.xml',
  world: 'https://www.hindustantimes.com/feeds/rss/world-news/rssfeed.xml',
  // politics: no stable native HT politics feed — Google News fallback.
};

export const HINDU_CATEGORY: Partial<Record<Category, string>> = {
  top: 'https://www.thehindu.com/news/feeder/default.rss',
  tech: 'https://www.thehindu.com/sci-tech/technology/feeder/default.rss',
  business: 'https://www.thehindu.com/business/feeder/default.rss',
  sports: 'https://www.thehindu.com/sport/feeder/default.rss',
  world: 'https://www.thehindu.com/news/international/feeder/default.rss',
  // politics: no standalone feeder — Google News fallback.
};

/** WordPress section feeds; `top` is the home feed (legitimate for top only). */
export const IE_CATEGORY: Partial<Record<Category, string>> = {
  top: 'https://indianexpress.com/feed/',
  tech: 'https://indianexpress.com/section/technology/feed/',
  business: 'https://indianexpress.com/section/business/feed/',
  politics: 'https://indianexpress.com/section/political-pulse/feed/',
  sports: 'https://indianexpress.com/section/sports/feed/',
  world: 'https://indianexpress.com/section/world/feed/',
};

export const NDTV_CATEGORY: Partial<Record<Category, string>> = {
  top: 'https://feeds.feedburner.com/ndtvnews-top-stories',
  tech: 'https://feeds.feedburner.com/gadgets360-latest',
  business: 'https://feeds.feedburner.com/ndtvprofit-latest',
  sports: 'https://feeds.feedburner.com/ndtvsports-latest',
  world: 'https://feeds.feedburner.com/ndtvnews-world-news',
};

/** NYT sports feed is empty (sports desk moved to The Athletic) — omitted. */
export const NYT_CATEGORY: Partial<Record<Category, string>> = {
  top: 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml',
  tech: 'https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml',
  business: 'https://rss.nytimes.com/services/xml/rss/nyt/Business.xml',
  politics: 'https://rss.nytimes.com/services/xml/rss/nyt/Politics.xml',
  world: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml',
};

/** WSJ politics feed returns 403 — omitted. */
export const WSJ_CATEGORY: Partial<Record<Category, string>> = {
  top: 'https://feeds.a.dj.com/rss/RSSWorldNews.xml',
  tech: 'https://feeds.a.dj.com/rss/RSSWSJD.xml',
  business: 'https://feeds.a.dj.com/rss/RSSMarketsMain.xml',
};

/** Category paths are edition-neutral; `top` is edition-specific (see registry). */
export const GUARDIAN_CATEGORY: Partial<Record<Category, string>> = {
  tech: 'https://www.theguardian.com/uk/technology/rss',
  business: 'https://www.theguardian.com/uk/business/rss',
  politics: 'https://www.theguardian.com/politics/rss',
  sports: 'https://www.theguardian.com/uk/sport/rss',
  world: 'https://www.theguardian.com/world/rss',
};

export const SMH_CATEGORY: Partial<Record<Category, string>> = {
  top: 'https://www.smh.com.au/rss/feed.xml',
  tech: 'https://www.smh.com.au/rss/technology.xml',
  business: 'https://www.smh.com.au/rss/business.xml',
  politics: 'https://www.smh.com.au/rss/politics/federal.xml',
  sports: 'https://www.smh.com.au/rss/sport.xml',
  world: 'https://www.smh.com.au/rss/world.xml',
};

export const ABC_AU_CATEGORY: Partial<Record<Category, string>> = {
  top: 'https://www.abc.net.au/news/feed/51120/rss.xml',
};

export const CNA_CATEGORY: Partial<Record<Category, string>> = {
  top: 'https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml',
};

/** Straits Times tech feed returns 400 — omitted. */
export const ST_CATEGORY: Partial<Record<Category, string>> = {
  top: 'https://www.straitstimes.com/news/singapore/rss.xml',
  business: 'https://www.straitstimes.com/news/business/rss.xml',
  sports: 'https://www.straitstimes.com/news/sport/rss.xml',
  world: 'https://www.straitstimes.com/news/world/rss.xml',
};

export const ALJAZEERA_CATEGORY: Partial<Record<Category, string>> = {
  top: 'https://www.aljazeera.com/xml/rss/all.xml',
};

/** DW publishes region feeds, not topic feeds: en-all → top, en-eu → world. */
export const DW_CATEGORY: Partial<Record<Category, string>> = {
  top: 'https://rss.dw.com/rdf/rss-en-all',
  world: 'https://rss.dw.com/rdf/rss-en-eu',
};
