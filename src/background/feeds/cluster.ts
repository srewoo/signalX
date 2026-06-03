import type { Article, StoryCluster } from '../../shared/contracts';
import { stableHash } from '../hash';

/**
 * Group articles covering the same story. Pure and deterministic so it is
 * unit-testable. Similarity = normalized-token Jaccard >= THRESHOLD, only
 * between articles within WINDOW_MS of each other.
 */

const THRESHOLD = 0.45;
const WINDOW_MS = 48 * 60 * 60 * 1000;

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'for', 'with',
  'at', 'by', 'from', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'has',
  'have', 'had', 'will', 'would', 'says', 'said', 'after', 'over', 'new', 'amid',
]);

export function tokenize(title: string): ReadonlySet<string> {
  const tokens = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
  return new Set(tokens);
}

function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

interface Member {
  readonly article: Article;
  readonly tokens: ReadonlySet<string>;
  readonly ts: number;
}

function clusterId(articles: readonly Article[]): string {
  // Deterministic id from the sorted set of article ids in the cluster.
  const key = [...articles.map((a) => a.id)].sort().join('|');
  return `c_${stableHash(key)}`;
}

/** Cluster articles by title similarity. Stable ordering: newest cluster first. */
export function clusterArticles(articles: readonly Article[]): readonly StoryCluster[] {
  const members: Member[] = articles
    .map((article) => ({
      article,
      tokens: tokenize(article.title),
      ts: Date.parse(article.publishedAt) || 0,
    }))
    .sort((x, y) => y.ts - x.ts);

  const groups: Member[][] = [];
  for (const m of members) {
    let placed = false;
    for (const group of groups) {
      const head = group[0];
      if (!head) continue;
      if (Math.abs(head.ts - m.ts) > WINDOW_MS) continue;
      if (jaccard(head.tokens, m.tokens) >= THRESHOLD) {
        group.push(m);
        placed = true;
        break;
      }
    }
    if (!placed) groups.push([m]);
  }

  return groups
    .map((group) => {
      const sorted = [...group].sort((x, y) => y.ts - x.ts);
      const arts = sorted.map((g) => g.article);
      const head = sorted[0];
      return {
        id: clusterId(arts),
        headline: head ? head.article.title : 'Untitled',
        articles: arts,
        newestAt: head ? head.article.publishedAt : new Date(0).toISOString(),
      } satisfies StoryCluster;
    })
    .sort((x, y) => Date.parse(y.newestAt) - Date.parse(x.newestAt));
}
