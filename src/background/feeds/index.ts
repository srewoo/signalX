import type {
  Article,
  Category,
  CountryCode,
  Result,
  StoryCluster,
} from '../../shared/contracts';
import { appError, err, ok } from '../result';
import { log } from '../logger';
import { clusterArticles } from './cluster';
import { fetchFeed } from './rss';
import { googleNewsSearch, sourcesFor } from './sources';
import { trendingTopics } from './trending';
import {
  getClusterById,
  indexClusters,
  readFeedCache,
  writeFeedCache,
} from './cache';

export { getClusterById };

interface AggregateResult {
  readonly articles: readonly Article[];
  readonly anyOk: boolean;
}

/** Fetch every source for a country/category in parallel; tolerate partial failure. */
async function aggregate(country: CountryCode, category: Category): Promise<AggregateResult> {
  const sources = sourcesFor(country);
  const results = await Promise.all(
    sources.map((s) => {
      const url = s.url(country, category);
      if (!url) return Promise.resolve({ articles: [] as readonly Article[], failed: true });
      return fetchFeed(url, s.sourceId, s.sourceName);
    }),
  );
  const articles: Article[] = [];
  let anyOk = false;
  for (const r of results) {
    if (!r.failed) anyOk = true;
    articles.push(...r.articles);
  }
  return { articles, anyOk };
}

export interface FeedResponse {
  readonly clusters: readonly StoryCluster[];
  readonly fetchedAt: string;
  readonly fromCache: boolean;
}

/**
 * Get a country/category feed with stale-while-revalidate. Fresh cache is
 * served immediately; stale or missing cache triggers a network fetch, falling
 * back to stale data (fromCache:true) when the network fails.
 */
export async function getFeed(
  country: CountryCode,
  category: Category,
): Promise<Result<FeedResponse>> {
  const scope = `${country}:${category}`;
  const cached = await readFeedCache(scope);
  if (cached && cached.fresh) {
    await indexClusters(cached.clusters);
    // A fresh cache hit is normal operation, not a degraded/offline state.
    // fromCache:true is reserved for the stale-fallback-on-network-failure path
    // below, which is what drives the panel's "offline" banner.
    return ok({ clusters: cached.clusters, fetchedAt: cached.fetchedAt, fromCache: false });
  }

  const { articles, anyOk } = await aggregate(country, category);
  if (!anyOk || articles.length === 0) {
    if (cached) {
      log.warn('feed network failed; serving stale', { scope });
      await indexClusters(cached.clusters);
      return ok({ clusters: cached.clusters, fetchedAt: cached.fetchedAt, fromCache: true });
    }
    return err(
      appError('FEED_UNAVAILABLE', 'Could not load news right now. Check your connection.'),
    );
  }

  const clusters = clusterArticles(articles);
  const fetchedAt = new Date().toISOString();
  await writeFeedCache(scope, clusters, fetchedAt);
  return ok({ clusters, fetchedAt, fromCache: false });
}

/** Trending topics for a country, derived from the cached/fresh top feed. */
export async function getTrending(country: CountryCode): Promise<Result<{ topics: readonly string[] }>> {
  const feed = await getFeed(country, 'top');
  if (!feed.ok) return err(feed.error);
  const articles = feed.value.clusters.flatMap((c) => c.articles);
  return ok({ topics: trendingTopics(articles) });
}

export interface SearchResponse {
  readonly clusters: readonly StoryCluster[];
  readonly totalArticles: number;
}

/** Keyword search via Google News RSS. Always indexes resulting clusters. */
export async function search(query: string, country: CountryCode): Promise<Result<SearchResponse>> {
  const trimmed = query.trim();
  if (!trimmed) return ok({ clusters: [], totalArticles: 0 });
  const url = googleNewsSearch(trimmed, country);
  const res = await fetchFeed(url, 'gnews', 'Google News');
  if (res.failed) {
    return err(appError('FEED_UNAVAILABLE', 'Search is unavailable right now. Try again shortly.'));
  }
  const clusters = clusterArticles(res.articles);
  await indexClusters(clusters);
  return ok({ clusters, totalArticles: res.articles.length });
}
