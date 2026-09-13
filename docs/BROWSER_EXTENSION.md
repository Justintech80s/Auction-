# Auction Browser Extension

Auction includes a Chromium Manifest V3 shopping assistant that detects supported product pages, sends normalized product data through Auction's existing valuation and Guardian pipeline, and displays the result in a browser side panel.

The extension is intentionally thin: marketplace adapters understand the current page, while valuation, sold-evidence handling, Opportunity classification, and Guardian decisions stay centralized in Auction's existing analysis code.

## Supported Browsers and Sites

The current implementation targets Chromium browsers first:

- Google Chrome
- Microsoft Edge

Supported U.S. shopping domains:

- `https://www.ebay.com/*`
- `https://www.amazon.com/*`
- `https://www.walmart.com/*`
- `https://www.bestbuy.com/*`

Safari is not part of this build. A future Safari Web Extension would require a separate Xcode packaging/conversion step.

## Install Locally in Chrome

Requirements: Node.js 20 or newer and a local clone of this repository.

1. Clone the repository.

   ```bash
   git clone https://github.com/Justintech80s/Auction-.git
   cd Auction-
   ```

2. Run the automated tests.

   ```bash
   npm test
   ```

3. Open `chrome://extensions` in Chrome.
4. Enable **Developer mode**.
5. Choose **Load unpacked**.
6. Select this repository's `extension/` directory.
7. Open a supported product page and open the **Auction Shopping Assistant** side panel.

For Microsoft Edge, use `edge://extensions`, enable Developer mode, choose **Load unpacked**, and select the same `extension/` directory.

After changing extension source files locally, return to the browser's extensions page and reload the unpacked extension.

## What the Extension Does

On a supported page, Auction follows this flow:

```text
Shopping Product Page
        |
        v
Content Script + Site Adapter
        |
        v
Normalized Product Record
        |
        v
Manifest V3 Service Worker
        |
        v
Auction Valuation / Sold Evidence / Guardian / Opportunity Pipeline
        |
        v
Side Panel Result
        |
        +--> Optional Local Watchlist Save
```

The side panel can display:

- detected product title
- current asking price
- estimated value and valuation range
- potential profit from the existing Opportunity result
- confidence
- verified sold count
- sold-evidence availability state
- Guardian risk state
- Auction's existing recommendation, including `strong_buy`, `buy`, `fair`, `overpriced`, `avoid`, or `manual_review`

The UI does not independently recalculate or upgrade Auction's recommendation.

## Sold Evidence and Asking Prices

Auction keeps asking-price evidence and completed-sale evidence distinct.

Active marketplace listings are **asking-price evidence**. They are never relabeled as verified sales merely because they appear on a marketplace page or in an active-listing API response.

Live verified sold evidence depends on a configured data provider and any approval or credentials that provider requires. If a sold-evidence provider is not configured or is unavailable, the extension must show that state instead of inventing sold history. Provider failure can degrade to available asking-price analysis, but it must not bypass Guardian or create stronger evidence than Auction actually has.

No provider credentials belong in the extension bundle or in GitHub.

## Permissions

The current `manifest.json` requests only:

- `sidePanel` — displays Auction alongside the shopping page.
- `storage` — stores the bounded local watchlist in `chrome.storage.local`.

Host permissions are limited to the four supported shopping domains above. The extension does not request `<all_urls>`.

The content script runs in Chrome's isolated world. Web-accessible extension modules are limited to the files needed by the scanner, adapters, page observer, and message contract, and they are exposed only on the supported shopping domains.

## Privacy and Local Watchlist

Auction does not need full-page archives to analyze a supported product. Marketplace page content is treated as untrusted data and normalized into a bounded product contract.

The browser extension is designed not to collect or store:

- passwords
- payment-card fields
- checkout contents
- private messages
- arbitrary unrelated browsing content
- raw product-page HTML snapshots
- marketplace or provider credentials

The local watchlist stores at most 200 records in `chrome.storage.local`. Records are deduplicated by canonical product URL and the oldest records are evicted first when the limit is exceeded.

A saved record contains normalized product metadata plus a selected, bounded analysis summary such as estimated value, range, confidence, verified sold count, potential profit, decision, Guardian state, and sold-evidence state. It does not persist raw upstream responses, arbitrary provenance blobs, credentials, or page HTML. Malformed persisted records are discarded during watchlist cleanup.

The current watchlist is browser-local; it is not an account-synced cloud watchlist.

## Security Boundaries

The product page is an untrusted input boundary. Text in a listing is data, not an instruction to the extension or analysis engine.

Key controls include:

- normalized and bounded product fields before analysis
- schema-validated, size-bounded extension messages
- HTTPS product URLs
- supported-domain manifest restrictions
- no arbitrary page-controlled network destination
- no remote executable code
- no silent checkout or purchase automation
- Guardian remains authoritative for review/reject decisions
- the side panel cannot override or strengthen Auction's recommendation
- asking evidence cannot masquerade as verified sold evidence

## Watchlist Save Behavior

After a successful analysis, the side panel exposes a real **Save** control. Saving writes the current normalized product and selected Auction analysis summary to local extension storage.

Saving the same canonical product URL again updates that product instead of creating a duplicate. The store exposes save, remove, and list operations and cleans malformed persisted records when reading the watchlist.

## Testing

Run the full deterministic test suite with:

```bash
npm test
```

The repository includes tests for:

- marketplace adapter normalization
- product scanning and SPA page-change observation
- extension message validation and size limits
- service-worker integration with Auction's existing pipeline
- Guardian/manual-review preservation
- sold-provider failure fallback
- side-panel view-model behavior and rendering helpers
- Manifest V3 domain/permission boundaries
- watchlist sanitization, deduplication, eviction, removal, and malformed-record cleanup

Live marketplace DOM checks should be treated as manual smoke tests because retail sites can change markup independently of this repository.

## Known Limitations

- Initial support is limited to the U.S. eBay, Amazon, Walmart, and Best Buy domains listed above.
- Marketplace layout changes can require adapter updates.
- Safari packaging is not included yet.
- The extension does not purchase items or automate checkout.
- The local watchlist does not sync across browsers or devices.
- Live sold evidence remains dependent on approved/configured provider access.
- Asking-price analysis can still be useful when sold evidence is unavailable, but the UI must clearly report the evidence state.

## Repository Locations

```text
extension/
  manifest.json
  service-worker.js
  adapters/
  content/
  messaging/
  sidepanel/
  storage/

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
```

Auction's browser layer is deliberately kept separate from its decision authority: the extension detects, transports, renders, and saves bounded local summaries; the existing Auction pipeline decides.