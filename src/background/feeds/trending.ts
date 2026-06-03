import type { Article } from '../../shared/contracts';

/**
 * Trending topics = most recurring stopword-filtered keywords and bigrams
 * across recent article titles. Pure and deterministic. Bigrams are weighted
 * higher because two-word phrases ("RBI policy") read as better topic chips.
 */

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'for', 'with',
  'at', 'by', 'from', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'has',
  'have', 'had', 'will', 'would', 'says', 'said', 'after', 'over', 'new', 'amid',
  'how', 'why', 'what', 'who', 'when', 'this', 'that', 'into', 'out', 'up',
  'his', 'her', 'its', 'their', 'they', 'you', 'your', 'not', 'more', 'than',
]);

const WINDOW_MS = 48 * 60 * 60 * 1000;
const BIGRAM_WEIGHT = 3;
const UNIGRAM_WEIGHT = 1;
const MAX_TOPICS = 12;

function words(title: string): readonly string[] {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

function titleCase(phrase: string): string {
  return phrase
    .split(' ')
    .map((w) => (w.length <= 3 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

/** Extract up to MAX_TOPICS trending topic strings from recent articles. */
export function trendingTopics(articles: readonly Article[], now = Date.now()): readonly string[] {
  const scores = new Map<string, number>();
  const add = (key: string, weight: number): void => {
    scores.set(key, (scores.get(key) ?? 0) + weight);
  };

  for (const a of articles) {
    const ts = Date.parse(a.publishedAt);
    if (!Number.isNaN(ts) && now - ts > WINDOW_MS) continue;
    const ws = words(a.title);
    for (const w of ws) add(w, UNIGRAM_WEIGHT);
    for (let i = 0; i < ws.length - 1; i++) {
      add(`${ws[i]} ${ws[i + 1]}`, BIGRAM_WEIGHT);
    }
  }

  return [...scores.entries()]
    .filter(([, score]) => score >= BIGRAM_WEIGHT * 2 || score >= 3)
    .sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1))
    .slice(0, MAX_TOPICS)
    .map(([phrase]) => titleCase(phrase));
}
