import { describe, it, expect } from 'vitest';
import { trendingTopics } from '../../src/background/feeds/trending';
import type { Article } from '../../src/shared/contracts';

const NOW = Date.parse('2026-06-03T12:00:00.000Z');

function article(title: string, publishedAt = '2026-06-03T11:00:00.000Z'): Article {
  return {
    id: title.slice(0, 8),
    title,
    url: `https://example.com/${encodeURIComponent(title)}`,
    sourceId: 'src',
    sourceName: 'Source',
    publishedAt,
  };
}

describe('trendingTopics', () => {
  it('should return an empty array when given no articles', () => {
    expect(trendingTopics([], NOW)).toEqual([]);
  });

  it('should filter out stopwords when ranking unigrams', () => {
    const articles = Array.from({ length: 4 }, () => article('The market and the economy'));
    const topics = trendingTopics(articles, NOW);
    // stopwords 'the','and' must never appear
    const joined = topics.join(' ').toLowerCase();
    expect(joined).not.toContain('the ');
    expect(joined).not.toContain(' and');
  });

  it('should surface a repeated bigram as a topic when it recurs', () => {
    const articles = [
      article('RBI policy decision today'),
      article('RBI policy review awaited'),
      article('RBI policy stance shifts'),
    ];
    const topics = trendingTopics(articles, NOW).map((t) => t.toLowerCase());
    expect(topics).toContain('rbi policy');
  });

  it('should rank higher-frequency phrases before lower ones', () => {
    const articles = [
      ...Array.from({ length: 5 }, () => article('Election results coming soon')),
      ...Array.from({ length: 2 }, () => article('Cricket finals scheduled later weekend')),
    ];
    const topics = trendingTopics(articles, NOW).map((t) => t.toLowerCase());
    const electionIdx = topics.findIndex((t) => t.includes('election'));
    const cricketIdx = topics.findIndex((t) => t.includes('cricket'));
    if (electionIdx !== -1 && cricketIdx !== -1) {
      expect(electionIdx).toBeLessThan(cricketIdx);
    } else {
      expect(electionIdx).toBeGreaterThanOrEqual(0);
    }
  });

  it('should exclude articles published outside the 48h window when ranking', () => {
    const recent = Array.from({ length: 3 }, () => article('Reform package signed law'));
    const stale = Array.from({ length: 5 }, () =>
      article('Ancient relic discovered cave', '2026-05-20T00:00:00.000Z'),
    );
    const topics = trendingTopics([...recent, ...stale], NOW).join(' ').toLowerCase();
    expect(topics).not.toContain('relic');
  });

  it('should cap the number of topics at the maximum when many qualify', () => {
    const articles: Article[] = [];
    for (let i = 0; i < 20; i++) {
      const word = `keyword${i}`;
      for (let j = 0; j < 4; j++) articles.push(article(`${word} ${word} alpha beta`));
    }
    expect(trendingTopics(articles, NOW).length).toBeLessThanOrEqual(12);
  });

  it('should drop a never-repeated unigram below the score threshold when ranking', () => {
    // A title with no adjacent non-stopword pairs yields only unigrams (weight 1),
    // which fall below the score>=3 threshold and are dropped.
    const topics = trendingTopics([article('Lone amid the over')], NOW);
    expect(topics).toEqual([]);
  });

  it('should NOT surface a single-occurrence bigram because one bigram is below the recurrence floor', () => {
    // A lone bigram (weight 3) from a single headline does not recur, so it must
    // stay below MIN_SCORE (BIGRAM_WEIGHT * 2 === 6) and never "trend".
    const topics = trendingTopics([article('Singular oddword appears once')], NOW);
    expect(topics.map((t) => t.toLowerCase())).not.toContain('singular oddword');
  });

  it('should surface a bigram once it recurs across two articles when ranking', () => {
    // Two occurrences of the same bigram → 2 * BIGRAM_WEIGHT === 6 ≥ MIN_SCORE.
    const topics = trendingTopics(
      [article('Recurring topic surfaces'), article('Recurring topic returns')],
      NOW,
    );
    expect(topics.map((t) => t.toLowerCase())).toContain('recurring topic');
  });

  it('should title-case the emitted topics when ranking', () => {
    const articles = Array.from({ length: 4 }, () => article('Quantum computing breakthrough announced'));
    const topics = trendingTopics(articles, NOW);
    // each emitted topic should start with an uppercase letter or be all-caps short word
    for (const t of topics) {
      expect(t[0]).toBe(t[0]!.toUpperCase());
    }
  });

  it('should not throw on articles with invalid publishedAt when ranking', () => {
    const articles = Array.from({ length: 3 }, () => article('Stable storyline topic here', 'not-a-date'));
    expect(() => trendingTopics(articles, NOW)).not.toThrow();
  });
});
