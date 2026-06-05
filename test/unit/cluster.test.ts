import { describe, it, expect } from 'vitest';
import { clusterArticles, tokenize } from '../../src/background/feeds/cluster';
import type { Article } from '../../src/shared/contracts';

const BASE = '2026-06-03T12:00:00.000Z';

function article(over: Partial<Article> & { id: string; title: string }): Article {
  return {
    url: `https://example.com/${over.id}`,
    sourceId: 'src',
    sourceName: 'Source',
    publishedAt: BASE,
    ...over,
  };
}

describe('tokenize', () => {
  it('should lowercase, strip punctuation and drop stopwords/short tokens when given a title', () => {
    const t = tokenize('The RBI Says: New POLICY!!');
    expect(t.has('rbi')).toBe(true);
    expect(t.has('policy')).toBe(true);
    // 'the', 'says', 'new' are stopwords; nothing <=2 chars
    expect(t.has('the')).toBe(false);
    expect(t.has('says')).toBe(false);
    expect(t.has('new')).toBe(false);
  });

  it('should return an empty set when given an all-stopword title', () => {
    expect(tokenize('the and or but').size).toBe(0);
  });

  it('should keep unicode-adjacent ascii tokens when given a unicode title', () => {
    const t = tokenize('Café opens München bureau');
    // non-ascii chars replaced by spaces; surrounding ascii fragments survive
    expect(t.has('opens')).toBe(true);
    expect(t.has('bureau')).toBe(true);
  });
});

describe('clusterArticles', () => {
  it('should return an empty array when given empty input', () => {
    expect(clusterArticles([])).toEqual([]);
  });

  it('should return a single cluster when given a single article', () => {
    const out = clusterArticles([article({ id: '1', title: 'Mars rover finds water ice deposits' })]);
    expect(out).toHaveLength(1);
    expect(out[0]!.articles).toHaveLength(1);
    expect(out[0]!.headline).toBe('Mars rover finds water ice deposits');
  });

  it('should group articles with identical titles when clustering', () => {
    const out = clusterArticles([
      article({ id: '1', title: 'Mars rover finds water ice deposits' }),
      article({ id: '2', title: 'Mars rover finds water ice deposits' }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.articles).toHaveLength(2);
  });

  it('should keep dissimilar titles in separate clusters when clustering', () => {
    const out = clusterArticles([
      article({ id: '1', title: 'Mars rover finds water ice deposits' }),
      article({ id: '2', title: 'Stock markets rally on rate cut hopes' }),
    ]);
    expect(out).toHaveLength(2);
  });

  it('should cluster titles at or above the Jaccard threshold and split below it', () => {
    // tokens A: {election, results, declared, today}  B shares 'election','results'
    // A∩B over A∪B controls the threshold (0.45).
    const high = clusterArticles([
      article({ id: '1', title: 'Election results announced winner today' }),
      article({ id: '2', title: 'Election results announced winner tonight' }),
    ]);
    expect(high).toHaveLength(1); // 4/5 = 0.8 >= 0.45

    const low = clusterArticles([
      article({ id: '1', title: 'Election results announced winner today' }),
      article({ id: '2', title: 'Cricket match cancelled winner today' }),
    ]);
    // shared meaningful tokens: 'winner','today' (2) vs union ~6 => ~0.33 < 0.45
    expect(low).toHaveLength(2);
  });

  it('should NOT cluster similar titles when they fall outside the 48h window', () => {
    const out = clusterArticles([
      article({ id: '1', title: 'Floods devastate coastal towns region', publishedAt: '2026-06-03T12:00:00.000Z' }),
      article({ id: '2', title: 'Floods devastate coastal towns region', publishedAt: '2026-05-30T12:00:00.000Z' }),
    ]);
    expect(out).toHaveLength(2);
  });

  it('should cluster similar titles when within the 48h window', () => {
    const out = clusterArticles([
      article({ id: '1', title: 'Floods devastate coastal towns region', publishedAt: '2026-06-03T12:00:00.000Z' }),
      article({ id: '2', title: 'Floods devastate coastal towns region', publishedAt: '2026-06-02T12:00:00.000Z' }),
    ]);
    expect(out).toHaveLength(1);
  });

  it('should produce deterministic cluster ids and ordering when run repeatedly', () => {
    const input = [
      article({ id: 'a', title: 'Budget tabled in parliament debate', publishedAt: '2026-06-03T10:00:00.000Z' }),
      article({ id: 'b', title: 'Budget tabled in parliament debate', publishedAt: '2026-06-03T11:00:00.000Z' }),
      article({ id: 'c', title: 'Tennis champion retires from sport', publishedAt: '2026-06-03T09:00:00.000Z' }),
    ];
    const a = clusterArticles(input);
    const b = clusterArticles([...input].reverse());
    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id));
  });

  it('should order clusters newest-first when clustering', () => {
    const out = clusterArticles([
      article({ id: 'old', title: 'Old singular story alpha', publishedAt: '2026-06-01T00:00:00.000Z' }),
      article({ id: 'new', title: 'New singular story beta', publishedAt: '2026-06-03T00:00:00.000Z' }),
    ]);
    expect(out[0]!.headline).toContain('beta');
    expect(out[0]!.newestAt > out[1]!.newestAt).toBe(true);
  });

  it('should pick the newest article title as headline when clustering', () => {
    const out = clusterArticles([
      article({ id: '1', title: 'Quake hits city early reports emerge', publishedAt: '2026-06-03T08:00:00.000Z' }),
      article({ id: '2', title: 'Quake hits city reports emerge update', publishedAt: '2026-06-03T12:00:00.000Z' }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.headline).toContain('update');
  });

  it('should handle unicode titles without throwing when clustering', () => {
    const out = clusterArticles([
      article({ id: '1', title: '東京 markets surge 日本 economy' }),
      article({ id: '2', title: '東京 markets surge 日本 economy' }),
    ]);
    expect(out).toHaveLength(1);
  });

  it('should treat invalid publishedAt as ts 0 without throwing when clustering', () => {
    const out = clusterArticles([
      article({ id: '1', title: 'Some unique headline here today', publishedAt: 'not-a-date' }),
    ]);
    expect(out).toHaveLength(1);
  });

  it('should retain Devanagari tokens (not collapse to an empty set)', () => {
    // The old ASCII-only strip wiped these; tokenization must keep them so
    // non-Latin stories can cluster.
    const t = tokenize('महाराष्ट्र विधान परिषद चुनाव');
    expect(t.size).toBeGreaterThan(0);
    expect(t.has('चुनाव')).toBe(true);
  });

  it('should keep ideographic 1-2 char tokens (CJK words)', () => {
    const t = tokenize('東京 経済');
    expect(t.has('東京')).toBe(true);
    expect(t.has('経済')).toBe(true);
  });

  it('should cluster two sources covering the same Devanagari story', () => {
    const out = clusterArticles([
      article({ id: '1', title: 'महाराष्ट्र विधान परिषद चुनाव परिणाम घोषित', sourceId: 'a' }),
      article({ id: '2', title: 'महाराष्ट्र विधान परिषद चुनाव परिणाम आज', sourceId: 'b' }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.articles).toHaveLength(2);
  });
});
