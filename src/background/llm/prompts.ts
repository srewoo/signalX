import type { StoryCluster, SummaryType } from '../../shared/contracts';

/** Versioned prompt builders. Bump PROMPT_VERSION on any wording/schema change. */

export const PROMPT_VERSION = 'v1';

const WORD_BUDGET: Record<SummaryType, string> = {
  short: 'about 100 words total',
  detailed: 'about 300 words total',
  keyfacts: 'concise bullet points',
};

function articleBlock(cluster: StoryCluster): string {
  return cluster.articles
    .slice(0, 12)
    .map((a, i) => {
      const snippet = a.snippet ? ` — ${a.snippet}` : '';
      return `[${i + 1}] (${a.sourceName}) ${a.title}${snippet}`;
    })
    .join('\n');
}

const SUMMARY_SCHEMA = `Return ONLY valid JSON, no prose, no markdown fences, matching exactly:
{
  "whatHappened": string,
  "keyEvents": string[],
  "importantQuotes": string[],
  "whatHappensNext": string,
  "keyFacts": string[]
}
"keyFacts" may be an empty array unless the summary type is keyfacts.`;

export interface PromptBundle {
  readonly system: string;
  readonly user: string;
}

/** Build the summary prompt for a cluster and summary type. */
export function buildSummaryPrompt(cluster: StoryCluster, type: SummaryType): PromptBundle {
  const system =
    'You are a precise news editor. You synthesize multiple articles about one story into ' +
    'a neutral, source-aware summary. Never invent facts not present in the inputs. ' +
    SUMMARY_SCHEMA;
  const focus =
    type === 'keyfacts'
      ? 'Emphasize the "keyFacts" array with the most important standalone facts.'
      : `Write ${WORD_BUDGET[type]}.`;
  const user =
    `Story: ${cluster.headline}\n\nArticles:\n${articleBlock(cluster)}\n\n` +
    `${focus}\nProduce the JSON object now.`;
  return { system, user };
}

const COMPARE_SCHEMA = `Return ONLY valid JSON, no prose, no markdown fences, matching exactly:
{
  "commonFacts": string[],
  "perspectives": [{ "sourceName": string, "perspective": string }],
  "coverageDifferences": string
}`;

/** Max clusters fed into the overview prompt; keeps the prompt bounded. */
const OVERVIEW_MAX_CLUSTERS = 8;

function overviewClusterBlock(clusters: readonly StoryCluster[]): string {
  return clusters
    .slice(0, OVERVIEW_MAX_CLUSTERS)
    .map((c, i) => {
      const sources = [...new Set(c.articles.map((a) => a.sourceName))].slice(0, 6).join(', ');
      const snippet = c.articles.find((a) => a.snippet)?.snippet;
      const snippetLine = snippet ? `\n    ${snippet}` : '';
      return `[${i + 1}] ${c.headline} (sources: ${sources || 'unknown'})${snippetLine}`;
    })
    .join('\n');
}

/**
 * Build the search-overview prompt. Produces a short plain-prose synthesis of
 * the news landscape for a query. No JSON — explicitly prose, 2–3 sentences.
 */
export function buildOverviewPrompt(
  query: string,
  clusters: readonly StoryCluster[],
): PromptBundle {
  const system =
    'You are a precise news editor. Given a search query and a set of clustered ' +
    'headlines from multiple outlets, write a neutral 2-3 sentence plain-text overview ' +
    'of the current news landscape for that query. Synthesize across the clusters; do not ' +
    'invent facts beyond the provided headlines and snippets. ' +
    'Return plain prose only — no JSON, no markdown, no bullet points, no headings.';
  const user =
    `Search query: ${query}\n\nTop story clusters:\n${overviewClusterBlock(clusters)}\n\n` +
    'Write the 2-3 sentence overview now as plain prose.';
  return { system, user };
}

/** Build the source-comparison prompt for a cluster. */
export function buildComparePrompt(cluster: StoryCluster): PromptBundle {
  const system =
    'You are a media analyst. You compare how different publishers cover the same story, ' +
    'identifying shared facts, each outlet\'s angle, and notable coverage differences. ' +
    'Base everything strictly on the provided articles. ' +
    COMPARE_SCHEMA;
  const user =
    `Story: ${cluster.headline}\n\nArticles by source:\n${articleBlock(cluster)}\n\n` +
    'Produce one perspective entry per distinct source present. Produce the JSON now.';
  return { system, user };
}
