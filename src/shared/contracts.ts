/**
 * SignalX shared contracts — single source of truth between panel (UI) and
 * background (service worker). Both sides import ONLY from src/shared/*.
 * Owned by the architect; dev agents must not redefine these shapes.
 */

// ───────────────────────── Domain ─────────────────────────

export type CountryCode = 'IN' | 'US' | 'GB' | 'AU' | 'SG' | 'AE' | 'GLOBAL';

export type Category =
  | 'top'
  | 'tech'
  | 'business'
  | 'politics'
  | 'sports'
  | 'world';

export interface Article {
  readonly id: string; // stable hash of url
  readonly title: string;
  readonly url: string;
  readonly sourceId: string; // e.g. 'bbc', 'reuters', 'toi'
  readonly sourceName: string; // display name
  readonly publishedAt: string; // ISO 8601
  readonly snippet?: string;
}

/** Articles about the same story, grouped for summarize/compare. */
export interface StoryCluster {
  readonly id: string;
  readonly headline: string; // representative title
  readonly articles: readonly Article[];
  readonly newestAt: string; // ISO 8601
}

export type SummaryType = 'short' | 'detailed' | 'keyfacts';

export interface SummarySections {
  readonly whatHappened: string;
  readonly keyEvents: readonly string[];
  readonly importantQuotes: readonly string[];
  readonly whatHappensNext: string;
  /** keyfacts type only */
  readonly keyFacts?: readonly string[];
}

export interface Summary {
  readonly clusterId: string;
  readonly type: SummaryType;
  readonly sections: SummarySections;
  readonly model: string;
  readonly latencyMs: number;
  readonly estCostUsd: number;
  readonly cached: boolean;
  readonly generatedAt: string;
}

export interface SourceComparison {
  readonly clusterId: string;
  readonly commonFacts: readonly string[];
  readonly perspectives: readonly { sourceName: string; perspective: string }[];
  readonly coverageDifferences: string;
}

// ───────────────────────── BYOK ─────────────────────────

export type ProviderId = 'anthropic' | 'openai' | 'gemini' | 'openrouter';

export interface ProviderSettings {
  readonly provider: ProviderId;
  readonly apiKey: string; // stored encrypted via chrome.storage.local, never synced
  readonly model: string;
}

export interface Preferences {
  readonly country: CountryCode;
  readonly defaultSummaryType: SummaryType;
  readonly theme: 'auto' | 'light' | 'dark';
}

// ───────────────────────── Bookmarks ─────────────────────────

export interface Folder {
  readonly id: string;
  readonly name: string;
}

export type SavedItem =
  | { readonly kind: 'article'; readonly id: string; readonly folderId: string; readonly savedAt: string; readonly article: Article }
  | { readonly kind: 'summary'; readonly id: string; readonly folderId: string; readonly savedAt: string; readonly headline: string; readonly summary: Summary };

// ───────────────────────── Errors ─────────────────────────

export type AppErrorCode =
  | 'RATE_LIMITED' // 429 — retryable, includes retryAfterSec
  | 'INVALID_KEY' // 401/403
  | 'BILLING' // provider out of credits
  | 'TIMEOUT'
  | 'PROVIDER_ERROR' // 5xx
  | 'OFFLINE'
  | 'NO_KEY' // AI action attempted in keyless mode
  | 'FEED_UNAVAILABLE'
  | 'INTERNAL';

export interface AppError {
  readonly code: AppErrorCode;
  readonly message: string; // safe, user-facing; never raw provider payloads
  readonly retryAfterSec?: number;
}

export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: AppError };

// ───────────────────────── Messaging protocol ─────────────────────────
// Panel → background via chrome.runtime.sendMessage(req): Promise<Result<T>>.
// Streaming uses a chrome.runtime.Port named 'summary-stream'.

export type Request =
  | { readonly type: 'feed/get'; readonly country: CountryCode; readonly category: Category }
  | { readonly type: 'feed/trending'; readonly country: CountryCode }
  | { readonly type: 'search/query'; readonly query: string; readonly country: CountryCode }
  | { readonly type: 'summary/get'; readonly clusterId: string; readonly summaryType: SummaryType } // cached only
  | { readonly type: 'compare/get'; readonly clusterId: string }
  | { readonly type: 'settings/getProvider' }
  | { readonly type: 'settings/setProvider'; readonly settings: ProviderSettings }
  | { readonly type: 'settings/testKey'; readonly settings: ProviderSettings }
  | { readonly type: 'settings/listModels'; readonly settings: ProviderSettings }
  | { readonly type: 'settings/getPrefs' }
  | { readonly type: 'settings/setPrefs'; readonly prefs: Preferences }
  | { readonly type: 'bookmarks/listFolders' }
  | { readonly type: 'bookmarks/createFolder'; readonly name: string }
  | { readonly type: 'bookmarks/save'; readonly item: SavedItem }
  | { readonly type: 'bookmarks/list'; readonly folderId?: string }
  | { readonly type: 'bookmarks/remove'; readonly id: string }
  | { readonly type: 'bookmarks/removeFolder'; readonly folderId: string }
  | { readonly type: 'search/overview'; readonly query: string; readonly clusterIds: readonly string[] }
  | { readonly type: 'feedback/submit'; readonly clusterId: string; readonly target: 'summary' | 'comparison'; readonly summaryType?: SummaryType; readonly verdict: 'up' | 'down' }
  | { readonly type: 'tabs/openSources'; readonly urls: readonly string[] };

export interface ResponseMap {
  'feed/get': { clusters: readonly StoryCluster[]; fetchedAt: string; fromCache: boolean };
  'feed/trending': { topics: readonly string[] };
  'search/query': { clusters: readonly StoryCluster[]; totalArticles: number };
  /** AI overview of search results (key-gated; NO_KEY error in keyless mode). Cached per query+model 1h. */
  'search/overview': { overview: string; model: string; estCostUsd: number; cached: boolean };
  'summary/get': Summary | null;
  'compare/get': SourceComparison;
  'settings/getProvider': ProviderSettings | null;
  'settings/setProvider': void;
  'settings/testKey': { valid: boolean };
  /** Live model list from the provider's /models API; 'fallback' = static catalog (API unreachable). */
  'settings/listModels': { models: readonly { id: string; label: string }[]; source: 'live' | 'fallback' };
  'settings/getPrefs': Preferences;
  'settings/setPrefs': void;
  'bookmarks/listFolders': readonly Folder[];
  'bookmarks/createFolder': Folder;
  'bookmarks/save': void;
  'bookmarks/list': readonly SavedItem[];
  'bookmarks/remove': void;
  /** Deletes the folder AND all items saved in it. */
  'bookmarks/removeFolder': void;
  'feedback/submit': void;
  'tabs/openSources': void;
}

/** Streaming protocol on Port 'summary-stream'. */
export interface StreamStart {
  readonly type: 'stream/start';
  readonly clusterId: string;
  readonly summaryType: SummaryType;
}
export type StreamEvent =
  | { readonly type: 'delta'; readonly section: keyof SummarySections; readonly text: string }
  | { readonly type: 'done'; readonly summary: Summary }
  | { readonly type: 'error'; readonly error: AppError };

export const STREAM_PORT = 'summary-stream' as const;

export const DEFAULT_PREFS: Preferences = {
  country: 'IN',
  defaultSummaryType: 'short',
  theme: 'auto',
};
