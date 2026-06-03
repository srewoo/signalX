# SignalX — Architecture (v1)

## Decision: Serverless extension. No SignalX backend server in MVP.

All logic runs inside the extension. BYOK keys never leave the device except to
the user's chosen AI provider. News fetched directly from public RSS feeds.

```
┌─────────────────────────── Chrome ───────────────────────────┐
│  Side Panel (per tab)              Service Worker (MV3)      │
│  src/panel/  ── chrome.runtime ──► src/background/           │
│  vanilla TS + DOM, no framework    feeds / cluster / llm /   │
│  renders states from prototype     storage / errors          │
│                                        │            │        │
│                                   RSS feeds    AI provider   │
│                                   (BBC, Reuters…) (BYOK key) │
└──────────────────────────────────────────────────────────────┘
```

## Module ownership

| Path | Owner | Contents |
|---|---|---|
| `src/shared/` | architect (frozen) | `contracts.ts` — types + message protocol |
| `src/background/` | backend agent | service worker, feeds, clustering, llm providers, storage, retry/errors |
| `src/panel/` | UI agent | panel.html, views, components, router, theme |
| `test/` | test agent | Vitest unit tests |

## Hard rules

1. Panel and background communicate ONLY via the typed protocol in `contracts.ts`
   (`Request`/`ResponseMap` over `chrome.runtime.sendMessage`; streaming over
   Port `summary-stream`). No direct imports across `panel/` ↔ `background/`.
2. TypeScript strict. No `any` — `unknown` + type guards. All external input
   (RSS XML, LLM output, storage reads) validated before use.
3. Every async boundary returns `Result<T>` — no thrown errors crossing the
   message boundary; map all failures to `AppError` codes.
4. No file > 300 lines, no function > 50 lines.
5. LLM output is parsed defensively (JSON with fallback extraction); never
   trust it to be well-formed.
6. API key stored via chrome.storage.local with AES-GCM encryption
   (WebCrypto, key derived from a per-install random secret). Never in sync
   storage, never logged.
7. Retry policy: 429 → backoff with jitter, max 3, honor Retry-After.
   5xx/timeout → 1 retry. 401/billing → no retry, surface actionable error.
8. Feed cache: chrome.storage.session, 5-min TTL, stale-while-revalidate;
   offline serves stale with `fromCache: true`.
9. Summary cache: keyed `clusterId+type+model`, 24h TTL.

## Stack

- TypeScript 5 strict, Vite (rollup multi-entry: background, panel), Vitest.
- Zero runtime dependencies in panel; `zod` allowed in background for validation.
- Manifest V3, `side_panel` + `sidePanel` permission, host permissions for RSS
  endpoints + AI provider APIs (optional host permissions where possible).
