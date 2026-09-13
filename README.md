# Auction

Auction is an experimental browser-native shopping assistant and marketplace-intelligence engine. It turns product-page information into structured pricing evidence, valuation ranges, Guardian risk signals, and explainable opportunity decisions while keeping asking prices distinct from verified sold evidence.

## Current Status

**Runnable valuation core + sold-evidence layer + Guardian security + Opportunity engine + Manifest V3 browser extension + bounded local watchlist.**

The repository includes a Chromium browser extension that can detect supported shopping product pages, normalize the product, send it through Auction's existing analysis pipeline, and render the result in a side panel. The browser layer does not duplicate Auction's pricing or recommendation rules; the existing pipeline remains authoritative.

The browser release is assembled as a self-contained unpacked package so its service-worker imports remain inside the extension root. Live provider-backed marketplace analysis still depends on approved/configured data access and a secure runtime credential boundary where required. Credentials must not be embedded in the extension bundle or committed to GitHub.

## Browser Shopping Assistant

Current browser support:

- Google Chrome
- Microsoft Edge

Current shopping domains:

- eBay US
- Amazon US
- Walmart US
- Best Buy US

The extension includes:

- marketplace-specific product-page adapters
- normalized, bounded product records
- automatic first scan and debounced SPA/page-change rescanning
- size-bounded extension messaging
- Manifest V3 service worker orchestration
- Auction valuation, sold-evidence, Guardian, and Opportunity integration
- side-panel states for scanning, analyzing, results, unsupported pages, and safe errors
- visible price, estimate, range, potential profit, confidence, verified sold count, Guardian state, and sold-evidence state
- `strong_buy`, `buy`, `fair`, `overpriced`, `avoid`, and `manual_review` decisions rendered exactly as returned by Auction
- a real local Save control backed by `chrome.storage.local`
- URL-deduplicated watchlist storage capped at 200 records
- a deterministic release-security gate for the generated extension package

See [`docs/BROWSER_EXTENSION.md`](docs/BROWSER_EXTENSION.md) for exact installation steps, permissions, privacy boundaries, known limitations, and testing guidance.

## Build and Install the Extension Locally

Requirements: Node.js 20 or newer.

```bash
git clone https://github.com/Justintech80s/Auction-.git
cd Auction-
npm test
npm run build:extension
```

Then:

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose `dist/auction-extension/`.
5. Open a supported product page and open the Auction side panel.

For Microsoft Edge, use `edge://extensions` and load the same `dist/auction-extension/` directory.

Do not use the source `extension/` directory as the final unpacked release root. The build command creates the self-contained package containing both the browser layer and the Auction pipeline modules required by its service worker.

Deterministic tests do not require marketplace or AI credentials.

## Implemented Analysis Behavior

- asking-price versus sold-evidence classification
- comparable deduplication
- USD price normalization
- robust extreme-outlier filtering
- similarity-aware comparable ranking
- evidence-weighted valuation
- valuation ranges and confidence scoring
- insufficient-evidence responses instead of fabricated certainty
- Opportunity scoring from acquisition price versus valuation
- sold-evidence gating for stronger recommendations
- provider-neutral sold-evidence contract and registry
- fixture sold-evidence provider for deterministic tests
- eBay Marketplace Insights provider implementation for approved access
- explicit `not_configured`, `ok`, and `unavailable` sold-evidence states
- safe fallback to asking evidence when a sold provider fails
- Guardian verification of sold-evidence freshness, provenance, duplicates, future timestamps, and verification claims
- marketplace connector registry
- official eBay Browse API connector for active/asking-price evidence
- Guardian request validation and bounded field sizes
- outbound HTTPS host allowlisting and SSRF/private-network blocking helpers
- deterministic allow/review/reject risk scoring
- optional bounded AI security analysis with timeout and malformed-output fallback
- deterministic Guardian decisions remain authoritative over AI suggestions
- provenance attached to protected valuation results
- automated GitHub Actions tests and CodeQL workflow

## Evidence Rules

Auction treats active listings and completed sales as different evidence classes.

The eBay Browse connector returns active listings, so those records are labeled **asking-price evidence**. They are not treated as completed sales.

Verified sold evidence is accepted only through the sold-evidence layer and its verification/provenance checks. Live sold evidence depends on approved/configured provider access. If a provider is missing or unavailable, Auction reports that state rather than inventing sales data.

## Protected Valuation Pipeline

```text
Shopping Page / API Request
        |
        v
Normalized Item Contract
        |
        v
Auction Guardian Gateway
        |
        v
Asking Connector + Sold-Evidence Provider
        |
        v
Comparable Ranking + Evidence Validation
        |
        v
Valuation Engine
        |
        v
Deterministic Risk Engine
        |
        +--> Optional bounded AI Security Brain
        |
        v
Opportunity Engine + Provenance
        |
        v
Browser Side Panel / API Result
```

Example direct pipeline usage:

```js
import { valueItem } from './src/pipeline.js';

const result = await valueItem(
  { brand: 'Sony', model: 'WM-2', category: 'Walkman' },
  {
    guardian: true,
    source: 'ebay',
    connectorOptions: { accessToken: process.env.EBAY_ACCESS_TOKEN },
    acquisitionPrice: 125
  }
);

console.log(result.valuation);
console.log(result.opportunity);
console.log(result.soldEvidence);
console.log(result.security);
console.log(result.provenance);
```

AI enrichment is optional. If no AI provider is supplied, Auction continues through the deterministic valuation and Guardian path. If AI fails, times out, or returns malformed output, deterministic results remain authoritative.

## Browser Privacy and Permissions

The Manifest V3 extension currently requests only:

- `sidePanel`
- `storage`

Host permissions are limited to the four supported U.S. shopping domains. The extension does not request `<all_urls>`.

Product-page text is treated as untrusted data. The extension is designed not to store passwords, card details, checkout contents, private messages, arbitrary unrelated browsing content, raw HTML snapshots, or provider credentials.

The local watchlist stores only normalized product metadata and a bounded analysis summary. It is capped at 200 records, deduplicates by canonical product URL, evicts the oldest record when full, and removes malformed persisted entries during cleanup.

The generated release package is statically checked for dynamic executable code, remote script/module loading, common HTML injection sinks, Node-only `process.env` access, and obvious committed credential patterns.

## Provider Credentials

No real credentials belong in GitHub or the browser extension bundle.

The eBay Browse connector requires an OAuth access token for live API use:

```js
import { searchMarketplace } from './src/connectors/index.js';

const listings = await searchMarketplace('ebay', 'Sony WM-2 Walkman', {
  accessToken: process.env.EBAY_ACCESS_TOKEN
});
```

The Marketplace Insights sold-evidence provider likewise requires approved eBay access. Local deterministic tests use injected/fixture providers instead of real credentials.

For a production browser deployment, provider credentials should stay behind a controlled backend or another secure runtime boundary rather than being shipped in the extension package.

## Repository Structure

```text
extension/
  manifest.json
  service-worker.js
  adapters/
    contract.js
    registry.js
    ebay.js
    amazon.js
    walmart.js
    bestbuy.js
    generic.js
  content/
    entry.js
    index.js
    scanner.js
    page-observer.js
  messaging/
    messages.js
    auction-client.js
  sidepanel/
    index.html
    app.js
    view-model.js
    styles.css
  storage/
    watchlist.js

scripts/
  build-extension.mjs

src/
  intelligence.js
  opportunity.js
  pipeline.js
  valuation.js
  connectors/
    index.js
    ebay.js
  sold-evidence/
    provider-contract.js
    registry.js
    normalize.js
    merge.js
    providers/
      fixture.js
      ebay-marketplace-insights.js
  security/
  ai/

dist/auction-extension/
  ...generated self-contained unpacked extension package (gitignored)

test/
  extension-adapter-contract.test.js
  extension-adapters.test.js
  extension-scanner.test.js
  extension-page-observer.test.js
  extension-messaging.test.js
  extension-integration.test.js
  extension-view-model.test.js
  extension-sidepanel.test.js
  extension-watchlist.test.js
  extension-release-security.test.js
  ...backend valuation/security/provider tests

.github/workflows/
  tests.yml
  codeql.yml

docs/
  BROWSER_EXTENSION.md
  ARCHITECTURE.md
  ROADMAP.md
  DATA_QUALITY.md
  SECURITY.md
```

## Engineering Principles

1. **Evidence over guesses** — valuation results should expose the evidence state instead of manufacturing certainty.
2. **Sold and asking prices are different signals** — active listings are never silently promoted to verified sales.
3. **Confidence should be explicit** — sparse, stale, or conflicting evidence lowers authority.
4. **Guardian outranks AI and UI** — browser code and AI enrichment cannot silently override deterministic review/reject decisions.
5. **Treat external content as untrusted** — marketplace text and metadata are data, not instructions.
6. **Legitimate data access** — production integrations should use permitted APIs or authorized sources.
7. **Privacy by design** — do not collect or persist credentials, checkout data, raw pages, or unnecessary upstream content.
8. **Testable boundaries** — adapters, messaging, valuation, sold evidence, Guardian, Opportunity, UI mapping, persistence, and release packaging are independently testable.

## Known Limitations

- Supported product detection is currently limited to eBay US, Amazon US, Walmart US, and Best Buy US.
- Marketplace DOM/layout changes can require adapter maintenance.
- Safari packaging is not implemented yet.
- The browser extension does not automate checkout or purchasing.
- The watchlist is local to browser storage and is not account-synced.
- Provider-backed live valuation/sold evidence requires approved runtime access and a secure credential boundary; deterministic tests use fixtures/mocks and the extension package contains no provider credentials.
- The current Opportunity profit figure does not yet include every real-world cost such as marketplace fees, shipping, taxes, repairs, payment processing, or holding costs.

## Next Engineering Milestones

- establish a secure production credential/backend boundary for live browser provider calls
- add net-profit/cost modeling for fees, shipping, taxes, repairs, processing, and holding costs
- add more marketplace connectors under the same trust-boundary rules
- add durable/distributed rate limiting and durable security-event observability for production deployment
- add production AI provider adapters behind the existing provider contract where they add measurable value
- package a Safari Web Extension after the Chromium release path is stable

See [`docs/ROADMAP.md`](docs/ROADMAP.md) for the broader staged plan.

## Portfolio Role

Auction represents the commerce/search side of the Justintech80s software portfolio: browser-native software that converts noisy marketplace information into structured, explainable pricing intelligence while treating external evidence and AI output as untrusted by default.

## Related Projects

- [MovieFinder](https://github.com/Justintech80s/MovieFinder) — intelligent movie and streaming discovery
- [Bunny](https://github.com/Justintech80s/Bunny) — noir-inspired interactive entertainment prototype

> A feature is considered implemented here only when corresponding source and reproducible verification are present.
