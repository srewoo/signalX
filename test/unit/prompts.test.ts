import { describe, it, expect } from 'vitest';
import {
  buildSummaryPrompt,
  buildComparePrompt,
  buildOverviewPrompt,
  PROMPT_VERSION,
} from '../../src/background/llm/prompts';
import type { Article, StoryCluster } from '../../src/shared/contracts';

function article(id: string, title: string, sourceName: string, snippet?: string): Article {
  return {
    id,
    title,
    url: `https://example.com/${id}`,
    sourceId: id,
    sourceName,
    publishedAt: '2026-06-03T12:00:00.000Z',
    ...(snippet ? { snippet } : {}),
  };
}

const cluster: StoryCluster = {
  id: 'c1',
  headline: 'Central bank holds rates',
  newestAt: '2026-06-03T12:00:00.000Z',
  articles: [
    article('a', 'RBI holds repo rate steady', 'Reuters', 'Inflation cooling'),
    article('b', 'Central bank keeps rates unchanged', 'BBC'),
  ],
};

describe('PROMPT_VERSION', () => {
  it('should be a present non-empty version string', () => {
    expect(typeof PROMPT_VERSION).toBe('string');
    expect(PROMPT_VERSION.length).toBeGreaterThan(0);
  });
});

describe('buildSummaryPrompt', () => {
  it('should include the headline, titles and source names when building', () => {
    const { user } = buildSummaryPrompt(cluster, 'short');
    expect(user).toContain('Central bank holds rates');
    expect(user).toContain('RBI holds repo rate steady');
    expect(user).toContain('Reuters');
    expect(user).toContain('BBC');
  });

  it('should include a strict JSON-only instruction in the system prompt when building', () => {
    const { system } = buildSummaryPrompt(cluster, 'short');
    expect(system).toContain('Return ONLY valid JSON');
    expect(system).toContain('no markdown fences');
  });

  it('should include the schema field names in the system prompt when building', () => {
    const { system } = buildSummaryPrompt(cluster, 'detailed');
    expect(system).toContain('whatHappened');
    expect(system).toContain('keyEvents');
    expect(system).toContain('importantQuotes');
    expect(system).toContain('whatHappensNext');
    expect(system).toContain('keyFacts');
  });

  it('should emphasize keyFacts in the user prompt when given the keyfacts type', () => {
    const { user } = buildSummaryPrompt(cluster, 'keyfacts');
    expect(user).toContain('keyFacts');
  });

  it('should state the word budget in the user prompt when given short or detailed', () => {
    expect(buildSummaryPrompt(cluster, 'short').user).toContain('100 words');
    expect(buildSummaryPrompt(cluster, 'detailed').user).toContain('300 words');
  });

  it('should include the article snippet when one is present', () => {
    const { user } = buildSummaryPrompt(cluster, 'short');
    expect(user).toContain('Inflation cooling');
  });
});

describe('buildComparePrompt', () => {
  it('should include the headline and a strict JSON-only instruction when building', () => {
    const { system, user } = buildComparePrompt(cluster);
    expect(user).toContain('Central bank holds rates');
    expect(system).toContain('Return ONLY valid JSON');
  });

  it('should include the comparison schema fields in the system prompt when building', () => {
    const { system } = buildComparePrompt(cluster);
    expect(system).toContain('commonFacts');
    expect(system).toContain('perspectives');
    expect(system).toContain('coverageDifferences');
  });

  it('should include the source names of the articles when building', () => {
    const { user } = buildComparePrompt(cluster);
    expect(user).toContain('Reuters');
    expect(user).toContain('BBC');
  });
});

describe('buildOverviewPrompt', () => {
  const second: StoryCluster = {
    id: 'c2',
    headline: 'Markets rally on rate decision',
    newestAt: '2026-06-03T12:00:00.000Z',
    articles: [article('d', 'Sensex jumps 500 points', 'TOI', 'Banks lead gains')],
  };

  it('should include the query and cluster headlines when building', () => {
    const { user } = buildOverviewPrompt('interest rates', [cluster, second]);
    expect(user).toContain('interest rates');
    expect(user).toContain('Central bank holds rates');
    expect(user).toContain('Markets rally on rate decision');
  });

  it('should instruct plain prose and forbid JSON in the system prompt', () => {
    const { system } = buildOverviewPrompt('interest rates', [cluster]);
    expect(system).toContain('plain prose only');
    expect(system).toContain('no JSON');
    expect(system).not.toContain('Return ONLY valid JSON');
  });

  it('should request a 2-3 sentence overview when building', () => {
    const { system, user } = buildOverviewPrompt('q', [cluster]);
    expect(system).toContain('2-3 sentence');
    expect(user).toContain('2-3 sentence');
  });

  it('should list distinct source names for a cluster', () => {
    const { user } = buildOverviewPrompt('q', [cluster]);
    expect(user).toContain('Reuters');
    expect(user).toContain('BBC');
  });
});
