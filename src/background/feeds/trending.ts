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
// A topic must show genuine recurrence to trend. A lone bigram (weight 3) from a
// single headline must NOT qualify; require either two bigram occurrences
// (>= BIGRAM_WEIGHT * 2) or equivalent accumulated weight (>= 6) across articles.
const MIN_SCORE = BIGRAM_WEIGHT * 2;

// Ideographic scripts where a 1–2 char token is a meaningful word.
const CJK_RE = /[぀-ヿ㐀-鿿가-힯豈-﫿]/u;

function words(title: string): readonly string[] {
  // Unicode-aware (NFKC + \p{L}\p{N}) so non-Latin titles contribute to trending
  // instead of being silently dropped by an ASCII-only strip.
  return title
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0 && !STOPWORDS.has(w) && ([...w].length > 2 || CJK_RE.test(w)));
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
    // Skip undateable items rather than counting them as in-window forever.
    if (Number.isNaN(ts) || now - ts > WINDOW_MS) continue;
    const ws = words(a.title);
    for (const w of ws) add(w, UNIGRAM_WEIGHT);
    for (let i = 0; i < ws.length - 1; i++) {
      add(`${ws[i]} ${ws[i + 1]}`, BIGRAM_WEIGHT);
    }
  }

  return [...scores.entries()]
    .filter(([, score]) => score >= MIN_SCORE)
    .sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1))
    .slice(0, MAX_TOPICS)
    .map(([phrase]) => titleCase(phrase));
}
