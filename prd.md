# Product Requirements Document (PRD)

## Product Name
NewsCompass (working title)

## Vision

Enable users to consume news from multiple trusted sources, countries, and languages through AI-generated summaries, comparisons, and personalized intelligence feeds.

Instead of reading dozens of articles, users receive concise, source-aware summaries and can drill down into original reporting when needed.

---

# Problem Statement

Modern news consumption suffers from:

1. Information overload
2. Duplicate reporting across publishers
3. Source bias
4. Regional language barriers
5. Time-consuming article reading
6. Fragmented coverage across multiple websites

Users need a single place to search, discover, compare, and summarize news.

---

# Target Users

## Primary

Knowledge Workers

- Engineers
- Product Managers
- Recruiters
- Founders
- Analysts
- Consultants

## Secondary

Students

Researchers

News Enthusiasts

Investors

---

# Goals

## Business Goals

- Launch Chrome Extension MVP
- Reach 1,000 active users
- Validate willingness to use AI summaries
- Validate BYOK (Bring Your Own Key) model

## User Goals

- Find news quickly
- Understand events in under 60 seconds
- Compare coverage from multiple sources
- Follow topics of interest
- Reduce time spent reading articles

---

# Core Features

## Feature 1: News Aggregation

Description:
Fetch latest news from multiple providers.

Supported Sources:

- BBC
- CNN
- Reuters
- Times of India
- Hindustan Times
- The Hindu
- Indian Express
- Regional RSS feeds

Capabilities:

- Top headlines
- Category feeds
- Country feeds
- Trending topics (tappable topic chips — e.g. "RBI Policy", "IPL Final" — that run a pre-filled search)

Resilience:

- If feeds cannot be fetched (offline / provider down), show cached headlines with a "last updated X min ago" banner and auto-refresh on reconnect.

---

## Feature 2: Search

Description:

Users can search for any topic.

Examples:

- AI Agents
- India Pakistan
- IPL
- Elections

System should return:

- Relevant articles
- Source information
- Publication date
- AI Overview (pinned summary card above results)

Access model:

- Search works WITHOUT an API key (articles + metadata only).
- The AI Overview card is key-gated; keyless users see an inline "Add key →" prompt in its place — never a hard wall.

---

## Feature 3: Country Preferences

Description:

Users can choose a default country.

Supported Countries:

- India
- United States
- United Kingdom
- Australia
- Singapore
- UAE
- Global

System behavior:

- Default country applied to all headline feeds.
- Country is changed via a chip in the top bar that opens a bottom-sheet picker (single tap to switch, persists immediately).

---

## Feature 4: AI Summary

Description:

Generate a concise summary of multiple articles.

Summary Types:

Short Summary
100 words

Detailed Summary
300 words

Key Facts
Bullet format

Output Example:

What Happened

Key Events

Important Quotes

What Happens Next

Generation UX:

- Summaries STREAM token-by-token into the "What Happened" block (perceived speed — 10s feels like 3s). A "Stop" control is shown while streaming.
- Generation metadata shown on completion: model, latency, estimated cost (e.g. "claude-haiku · 4.2s · ~$0.002") — reinforces BYOK cost transparency.
- Summaries are cached per story cluster + summary type; re-opening shows "cached · $0.000".
- Every summary has 👍 / 👎 feedback and a ↻ Regenerate action (feeds quality metrics).

---

## Feature 5: Bring Your Own LLM Key

Description:

Users provide their own API key.

Supported Providers:

- OpenAI
- Anthropic
- Gemini
- OpenRouter

Benefits:

- Reduced platform costs
- User choice
- Better privacy

Settings Stored:

Provider

API Key

Preferred Model

Error Handling (PRIMARY flows, not edge cases):

| Failure | Behavior |
|---|---|
| 429 rate limit | Auto-retry with backoff (max 3), countdown shown, "Retry now" + "Switch model" actions |
| 401 invalid/expired key | "Update key" + "Test key" actions; headlines continue to work — only AI features pause |
| Billing / out of credits | "Switch provider" + deep link to provider billing page |
| Timeout / 5xx | Single retry, then error card with "Retry" |

Key onboarding:

- "Test key" validation on entry (cheap 1-token call) before saving.
- First-run screen offers "Skip — browse without AI"; keyless mode is fully supported for feeds and search.

---

## Feature 6: Source Comparison

Description:

Compare how different publishers cover the same story.

Output:

Common Facts

BBC Perspective

CNN Perspective

Reuters Perspective

Coverage Differences

---

## Feature 7: Save & Bookmark

Users can:

- Save articles
- Save AI summaries (visually distinct from articles via ✦ badge)
- Organize by folders

Save flow:

- Tapping 🔖 opens a bottom-sheet folder picker (existing folders + "＋ New folder" inline).
- Saved AI summaries remain readable offline.

Examples:

Technology

Politics

Markets

Research

---

# Future Features

## Daily Briefing

Generate personalized morning briefing.

---

## Topic Tracking

Follow:

- AI
- Startups
- Markets
- Sports

Receive updates only for selected topics.

---

## Regional Language Translation

Support:

- Hindi
- Marathi
- Tamil
- Telugu
- Bengali

Generate English summaries.

---

## AI News Chat

Users can ask:

"Summarize AI news from last week"

"What changed today in India-US relations?"

"Show all major developments about OpenAI"

---

# Platform & UX Requirements

## Persistence Model (decided)

- The extension UI is a **Chrome Side Panel** (`chrome.sidePanel`, MV3, Chrome 114+) — NOT an action popup.
- Rationale: popups always close on outside clicks (platform restriction, no workaround). The side panel persists while the user browses.
- The panel is scoped **per tab** via `chrome.sidePanel.setOptions({ tabId, enabled: true })` — opening SignalX on one tab does NOT open it on other tabs.
- Panel dimensions: ~380px wide, full browser height.

## Design Principles

- Minimalist, near-monochrome palette; single accent color reserved exclusively for AI actions (✦).
- Text-first cards — no article images in feeds (speed). Source identity via small colored pips.
- System font stack — zero font downloads.
- Navigation: **top icon rail** in the header (Feed / Search / Saved / Settings) — the top is the glanceable zone in a tall side panel; bottom navs are a mobile idiom and are not used.
- Skeleton loaders for all async content; streaming for AI output.

## Theming

- Light + dark mode. Default: follow system (`prefers-color-scheme`), with manual override in Settings.
- Both themes derive from the same design tokens (CSS variables).

## Opening Original Sources

- "Sources (N)" screen lists every article in the cluster with publisher, age, and headline.
- Each opens in a **new background tab** — the user's position in the panel is preserved.
- "Open all N in background tabs" bulk action.

---

# User Flow

Open Extension (side panel, per tab)

↓

Load Country Feed (or cached feed if offline)

↓

View Headlines / Trending Topics

↓

Search Topic (works keyless)

↓

Fetch Articles

↓

AI Summary Streamed (key-gated; errors handled per Feature 5 table)

↓

👍/👎 Feedback · ↻ Regenerate · ⇄ Compare Sources

↓

Open Original Sources (background tabs)

↓

Save / Bookmark (folder picker sheet)

---

# Non Functional Requirements

Performance

- Feed load < 2 seconds
- Search < 3 seconds
- AI summary < 10 seconds total; first streamed token < 2 seconds

Resilience

- All BYOK provider failures (429 / 401 / billing / timeout) produce actionable error states — never a dead end
- Offline: cached headlines + saved summaries remain available

Scalability

- Support 10,000+ users

Security

- API keys encrypted locally
- No storage of user credentials on server

Privacy

- No user tracking
- No sale of browsing history

Availability

- 99.9% uptime

---

# Success Metrics

Acquisition

- Extension installs

Engagement

- Daily active users
- Searches per user
- Summaries generated

Retention

- 7-day retention
- 30-day retention

Value Metrics

- Average reading time reduced
- Articles summarized per day

Quality Metrics

- Summary 👍 rate (target > 80%)
- Regenerate rate (proxy for bad summaries, target < 10%)
- AI error rate by provider/category (429 vs 401 vs billing)

---

# MVP Scope

Included

✓ News Aggregation

✓ Search

✓ Country Selection

✓ AI Summaries

✓ User LLM Keys (incl. error handling + key validation)

✓ Bookmarks (folder picker flow)

✓ Source Comparison

✓ Per-tab persistent Side Panel UI

✓ Streaming summaries + feedback (👍/👎/↻)

✓ Dark mode (system + manual)

✓ Keyless mode (feeds + search without API key)

Excluded

✗ Daily Brief

✗ AI Chat

✗ Mobile App

✗ Topic Tracking

✗ Translation

Target Release: Version 1.0