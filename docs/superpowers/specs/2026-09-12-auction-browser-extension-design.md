# Auction Browser Shopping Assistant Design

**Date:** 2026-09-12

## Goal

Transform Auction from a primarily standalone valuation application into a browser-native shopping assistant that automatically becomes available when a user opens a supported product or marketplace page.

The first production target is a Chromium Manifest V3 extension for Chrome and Edge. Safari support comes after the Chromium version is stable.

## Product Experience

The core user flow is:

1. User opens a supported product/listing page.
2. Auction detects the current item and extracts bounded product metadata.
3. Auction sends a normalized item request into the existing Auction intelligence pipeline.
4. Auction evaluates asking evidence, accepted sold evidence, Guardian risk, valuation, and resale opportunity.
5. Auction presents the result in a browser side panel without requiring the user to visit a standalone website first.
6. The user may save or watch the item, but purchases remain user-confirmed actions.

The first release should answer one question quickly: **Is this item a good buy at the current price?**

## Scope for Version 1

Version 1 supports:

- Chrome and Edge through one Manifest V3 codebase.
- Browser side panel UI.
- Automatic product-page detection on approved supported domains.
- Site adapters for eBay, Amazon, Walmart, and Best Buy.
- A generic product-page fallback for pages with usable structured product metadata.
- Normalized extraction of title, visible price, currency, condition, model/product identifiers when available, seller/source metadata, and page URL.
- Integration with Auction's existing valuation, Guardian, sold-evidence, and Opportunity Engine layers.
- Deal classifications such as `strong_buy`, `buy`, `fair`, `overpriced`, `avoid`, and `manual_review` according to existing backend rules.
- Explicit sold-evidence confidence rather than treating asking prices as completed sales.
- Safe fallback when sold-price providers are unavailable.
- Page-change detection for single-page shopping sites.
- Manual refresh and retry when automatic extraction or analysis fails.

Version 1 does not automatically purchase products, enter payment information, bypass seller/platform controls, or silently browse unrelated pages.

## Architecture

```text
Shopping Page
    |
    v
Content Script
    |
    v
Site Adapter Registry
    |
    v
Normalized Product Record
    |
    v
Extension Service Worker
    |
    v
Auction Analysis Client
    |
    v
Auction Backend / Existing Pipeline
    |
    +--> Marketplace Asking Evidence
    +--> Sold Evidence Provider Layer
    +--> Guardian Verification
    +--> Valuation Engine
    +--> Opportunity Engine
    |
    v
Normalized Analysis Result
    |
    v
Browser Side Panel
```

The browser extension is a presentation and page-understanding layer. Pricing authority, sold-evidence verification, security decisions, and opportunity classification remain centralized in Auction's existing intelligence modules rather than being duplicated in site-specific scripts.

## Extension Structure

```text
extension/
  manifest.json
  service-worker.js
  content/
    scanner.js
    page-observer.js
  adapters/
    registry.js
    ebay.js
    amazon.js
    walmart.js
    best-buy.js
    generic.js
  messaging/
    messages.js
    auction-client.js
  sidepanel/
    index.html
    app.js
    styles.css
  shared/
    normalize-product.js
    validation.js
    errors.js
```

Each marketplace adapter has one responsibility: convert the current page into the shared normalized product contract.

## Normalized Product Contract

Site adapters return a bounded object shaped approximately as:

```js
{
  source: 'ebay',
  sourceId: 'listing-or-product-id',
  title: 'Sony WM-2 Walkman',
  price: 129.99,
  currency: 'USD',
  condition: 'Used',
  brand: 'Sony',
  model: 'WM-2',
  category: 'Portable Cassette Players',
  seller: 'seller-name',
  url: 'https://...',
  pageType: 'product'
}
```

Unknown fields remain `null` or are omitted. Adapters must not invent missing product details.

## Site Adapter Rules

Adapters should prefer structured page data over fragile CSS scraping when legitimate data is already present in the page, including JSON-LD, meta tags, accessible labels, or stable product attributes.

Each adapter must:

- identify whether it supports the current page;
- extract only product-related fields needed by Auction;
- bound text sizes;
- validate price and currency;
- avoid reading checkout/payment fields;
- never classify an active listing as a completed sale;
- fail safely with a structured unsupported/incomplete result.

The generic adapter should use common Product schema/JSON-LD and standard metadata rather than broad DOM harvesting.

## Page Detection and Refresh

A lightweight page observer detects URL changes and meaningful product-content changes on single-page applications.

It must debounce rapid mutations to prevent repeated Auction analysis calls. A new analysis should run when the canonical product identity changes, not for every DOM mutation.

The content script sends only the normalized product object to the service worker. Large HTML snapshots should not be transmitted or stored.

## Messaging Boundary

Browser components communicate using explicit message types, for example:

- `PRODUCT_DETECTED`
- `ANALYSIS_REQUESTED`
- `ANALYSIS_STARTED`
- `ANALYSIS_COMPLETE`
- `ANALYSIS_FAILED`
- `SAVE_ITEM`
- `REFRESH_ITEM`

Message payloads are schema-validated before use.

Content scripts do not directly call privileged backend endpoints when the service worker can provide the trust boundary.

## Auction Backend Integration

The extension should reuse the existing Auction item-analysis flow rather than implement valuation in the browser.

The backend analysis request should provide:

- normalized item identity;
- current acquisition/listing price;
- source/page context;
- Guardian enabled;
- sold-evidence gate enabled where the provider configuration allows it.

The analysis response should expose only the fields required by the side panel, including:

- current price;
- estimated value and range;
- valuation confidence;
- verified sold count;
- sold-evidence status/risk;
- expected profit;
- expected margin;
- recommended maximum bid where relevant;
- Opportunity decision;
- Guardian decision;
- concise evidence/provenance summary.

If sold evidence is unavailable, Auction must state that explicitly and must not falsely present asking prices as verified completed sales.

## Side Panel UI

The first side panel should prioritize decision clarity over dense analytics.

Primary section:

- Product title
- Current price
- Estimated value
- Potential profit
- Confidence
- Verified sold count
- Deal classification

Secondary actions:

- Refresh analysis
- View evidence/comparables
- Save item
- Watch item (when persistence/alert support is implemented)

Security states are visible:

- `manual_review` for Guardian review/reject cases;
- sold evidence unavailable/failed/review states;
- insufficient evidence rather than fabricated certainty.

## Permissions and Privacy

The extension should request the minimum practical permissions.

Initial permissions should include only what is necessary for:

- side panel operation;
- extension storage for preferences/saved lightweight state;
- page scripts on explicitly supported shopping domains;
- service-worker messaging/network access to the Auction backend.

Avoid global `<all_urls>` access in the initial release unless a later generic-page feature clearly requires it and the permission UX is justified.

Sensitive data rules:

- never collect passwords, payment-card fields, checkout form contents, private messages, or unrelated browsing content;
- do not store raw page HTML;
- do not place marketplace/backend credentials in the extension bundle;
- provider credentials remain server-side;
- store only the minimum product/watchlist information users intentionally save.

## Security Model

Marketplace content is untrusted input.

The extension must:

- treat DOM text and structured page metadata as data, not instructions;
- sanitize any text rendered in the side panel;
- validate message origin/context and payload shape;
- prevent arbitrary URL fetches from content-script input;
- allowlist Auction backend endpoints;
- use the existing Guardian layer for deterministic analysis risk;
- never allow extension-side AI output to override Guardian decisions.

No marketplace page can supply executable instructions to Auction through product descriptions or other text fields.

## Error Handling

Expected states include:

- unsupported page;
- product detected but missing price;
- marketplace adapter parse failure;
- Auction backend unreachable;
- asking evidence unavailable;
- sold provider unavailable;
- sold provider failure;
- insufficient valuation evidence;
- Guardian review/reject;
- stale analysis due to page navigation.

Each state receives a stable machine code and a concise user-facing message. Provider failures should not crash the extension or erase a valid asking-evidence analysis.

## Testing Strategy

### Unit Tests

- normalized product validation;
- adapter parsing from deterministic HTML/JSON fixtures;
- malformed and missing fields;
- page identity/change detection;
- message validation;
- side-panel state mapping;
- URL/domain allowlisting.

### Integration Tests

- product fixture -> adapter -> normalized item;
- normalized item -> service-worker request;
- mocked Auction response -> side-panel decision display;
- verified sold evidence path;
- sold provider unavailable/failure path;
- Guardian review/reject path;
- asking-only path cannot be presented as verified sales.

### Browser Tests

Use deterministic local test pages or controlled fixtures for Chrome/Edge extension testing. CI must not rely on live Amazon/eBay/Walmart/Best Buy page markup.

Manual smoke tests on current live supported sites are a separate release check because marketplace DOM structures can change independently of Auction code.

## Release Phases

### Phase 1 — Extension Foundation

- Manifest V3 shell
- service worker
- side panel
- messaging contract
- generic product state

### Phase 2 — Product Detection

- adapter registry
- eBay adapter
- Amazon adapter
- Walmart adapter
- Best Buy adapter
- generic JSON-LD adapter
- page observer

### Phase 3 — Auction Intelligence Connection

- backend analysis client
- acquisition-price handoff
- Guardian-enabled analysis
- sold-evidence gate
- opportunity classification
- error/fallback handling

### Phase 4 — Decision UI

- valuation card
- confidence/sold evidence
- profit/margin
- deal classification
- evidence details
- refresh/save controls

### Phase 5 — Verification and Distribution

- Chrome manual loading and smoke tests
- Edge compatibility verification
- permission/privacy review
- packaging
- Chrome Web Store submission preparation
- Edge Add-ons submission preparation

### Phase 6 — Later Enhancements

Not part of initial release:

- persistent watchlists/alerts;
- automatic result-page deal badges;
- price-drop notifications;
- cross-store comparison views;
- Safari packaging through Apple's extension workflow;
- authenticated user synchronization;
- fee/shipping/tax-aware net-profit calculations once the Auction cost engine exists.

## Success Criteria

Version 1 is successful when:

1. A user can install the extension in Chrome/Edge.
2. Opening a supported product page causes Auction to detect the item without visiting a separate Auction website.
3. The side panel shows current price and a backend-generated Auction valuation/opportunity result.
4. Asking and verified sold evidence remain explicitly distinct.
5. Guardian review/reject states cannot appear as confident buy recommendations.
6. Missing sold evidence cannot falsely produce a verified-sales claim.
7. Product-page navigation refreshes the analysis without full browser reloads.
8. Unsupported pages and provider failures degrade safely.
9. Extension permissions and stored data remain minimal and explainable.
10. Automated tests use deterministic fixtures and do not depend on marketplace credentials or live marketplace DOMs.

## Implementation Constraint

The existing Base44 website is not a prerequisite for the browser extension. The extension should use the Auction backend/intelligence as its decision engine and can function independently of users opening `auctionsave.base44.app`.
