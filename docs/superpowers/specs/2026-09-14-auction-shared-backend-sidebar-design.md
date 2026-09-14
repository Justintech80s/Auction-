# Auction Shared Backend → Browser Sidebar Design

## Status
Approved architecture: Option A. The browser extension will use the same Auction product-identification and price-comparison backend flow as the website experience, with the manual upload step replaced by automatic capture from the current product page.

## Problem
The current extension can open the Auction popup and begin a scan, but production behavior stops before producing website-style comparison results. Two concrete problems exist today:

1. The side panel can open after scan messages were already published, leaving it stuck in the idle state.
2. The production extension starts cross-store search with no live shopping providers configured, so the extension cannot return real comparison offers even when product identification succeeds.

The website experience already demonstrates the target behavior: upload/capture product evidence, identify the product, show product details, search stores, display the lowest price, list comparison offers, provide store links, and show savings tips.

## Goal
Make `Scan This Product` in the browser extension perform the same user-visible flow as the Auction website without requiring the user to upload an image.

Expected browser flow:

```text
Product page
  ↓
Click Auction toolbar icon
  ↓
Scan This Product
  ↓
Capture bounded product evidence from current page
  ↓
Send evidence to shared Auction backend
  ↓
Product Identified
  ↓
Product / Brand / Model / Features
  ↓
Searching Stores
  ↓
Lowest Price Found
  ↓
Price Comparison
  ↓
Visit Store links
  ↓
Savings Tips
```

All results stay inside the Auction browser sidebar.

## Architecture

### 1. Browser Extension as Capture + Presentation Layer
The extension owns:

- explicit user-triggered scan
- active-tab product evidence capture
- session state and retry state
- sending a bounded request to the shared Auction backend
- rendering backend results in the side panel
- Guardian enforcement on returned offers before highlighting or ranking them

The extension does not embed provider credentials or implement a second independent shopping-search engine.

### 2. Shared Auction Backend as Source of Truth
The website and extension use one backend contract for product identification and online price comparison.

The browser request contains only bounded product evidence such as:

- source page URL
- page title
- detected product title
- brand
- model
- SKU / MPN / GTIN / UPC when available
- product condition when available
- bounded key specifications
- primary product image URL
- current visible price when available
- capture timestamp

The backend performs:

- product identification
- visual fallback when metadata is weak
- store search
- offer normalization
- lowest-price selection
- price-comparison preparation
- savings-tip generation

Provider/API secrets remain behind the backend boundary.

## Shared Result Contract
The extension sidebar and website should consume the same logical result structure.

```js
{
  status: 'complete' | 'partial_results' | 'needs_confirmation' | 'no_results' | 'provider_unavailable' | 'error',
  identifiedProduct: {
    title,
    brand,
    model,
    features: [],
    imageUrl,
    confidence
  },
  lowestPrice: {
    amount,
    currency,
    store,
    url,
    shipping,
    estimatedTotal,
    condition
  } | null,
  priceComparison: [
    {
      store,
      title,
      price,
      currency,
      shipping,
      estimatedTotal,
      condition,
      description,
      url,
      imageUrl,
      matchConfidence,
      guardianDecision
    }
  ],
  savingsTips: [],
  providerErrors: []
}
```

### Ranking Rules
The backend/extension contract must preserve the existing Auction safety rules:

- exact model/spec match outranks similar products
- suspicious or rejected offers cannot become the highlighted cheapest recommendation
- unknown shipping must stay unknown rather than being treated as zero
- lowest item price and lowest known delivered total remain distinct concepts
- trusted stores may be preferred when prices are otherwise materially equivalent

## Side Panel UX
The extension side panel will mirror the website result progression.

### States

1. `ready`
2. `scanning`
3. `identifying`
4. `needs_confirmation`
5. `searching_stores`
6. `complete`
7. `partial_results`
8. `no_results`
9. `provider_unavailable`
10. `error`

### Complete Result Layout
The side panel will display, in order:

1. **Product Identified**
   - image
   - product title
   - brand
   - model
   - feature chips

2. **Lowest Price Found**
   - highlighted price
   - store
   - short description
   - condition and shipping/total information when known

3. **Price Comparison**
   - multiple offer cards
   - store
   - price
   - description
   - condition
   - shipping / estimated total where known
   - `Visit Store` button
   - exact/similar match indication when relevant
   - Guardian state when relevant

4. **Savings Tips**
   - bounded list of actionable shopping tips generated from the result context

The existing cost/valuation tools may remain available below or in a separate section, but they must not block or obscure the scan-to-price-comparison flow.

## Scan Session Reliability
The service worker owns the scan job and persists its latest bounded state in `chrome.storage.session` when available.

Persisted session data includes only:

- scan ID
- active tab ID
- source URL
- current scan state
- identified product summary
- normalized shared-backend result
- error/status code
- update timestamp

Raw HTML, cookies, credentials, checkout data, and arbitrary page content are never persisted.

### Race Fix
The side panel must not rely only on transient runtime messages.

Flow:

1. Popup sends scan request.
2. Service worker immediately writes `scanning` state.
3. Service worker opens/updates the side panel.
4. Side panel loads and requests the current scan session.
5. Service worker returns the most recent persisted state.
6. Every subsequent state transition is both persisted and broadcast.

This guarantees that opening the side panel after a message was sent cannot leave the UI stuck on `idle`.

If `chrome.storage.session` is unavailable, use a bounded in-memory worker cache as a fallback, recognizing that it may be lost if the worker is terminated.

## Backend Connectivity
The extension needs one controlled HTTPS backend endpoint or backend-client abstraction that exposes the shared Auction scan operation.

Conceptual request:

```text
POST /auction/product-scan
```

Conceptual payload:

```js
{
  source: 'browser_extension',
  sourceUrl,
  title,
  brand,
  model,
  identifiers,
  specs,
  imageUrl,
  currentPrice,
  condition,
  capturedAt
}
```

The concrete endpoint name may differ based on the existing website backend, but the browser must call the same underlying identification/search capability rather than its current empty-provider production path.

### Security

- HTTPS only
- no provider credentials in the extension
- strict response schema validation
- bounded request/response size
- safe URL validation before rendering `Visit Store`
- timeout and retry policy
- Guardian screens returned offers before recommendation
- no automated purchase/checkout

## Product Identification
Browser scan evidence should use this priority:

1. structured product metadata / JSON-LD
2. model/SKU/MPN/GTIN/UPC and strong visible identifiers
3. product title, brand, specs, and page URL
4. primary product image visual fallback through the shared backend

Unlike the current extension-only path, weak metadata must not dead-end merely because no local visual provider is configured. The backend provides the same visual-identification capability used by the website flow.

If confidence remains too low, return `needs_confirmation` instead of guessing.

## Error Handling

### Backend unavailable
Show `Price search unavailable` with a retry action. Never leave the panel idle.

### Product not confidently identified
Show `Needs confirmation` and the best bounded identity evidence available.

### Partial provider failure
Show available offers and label the result `partial_results`.

### No matching offers
Show `No matching prices found` instead of fabricated comparison cards.

### Invalid or unsafe offer URL
Drop or Guardian-reject the offer; never render an unsafe `Visit Store` link.

## Testing Strategy
Implementation will be test-first.

### Regression test for current bug
Reproduce:

```text
open Amazon product page
click Scan This Product
side panel opens after scan starts
result messages occur before side panel initialization
```

Expected: side panel hydrates from persisted scan state and continues to results rather than staying idle.

### Shared backend contract tests
Verify:

- request contains only bounded product evidence
- exact backend result schema maps to sidebar UI
- product identified data renders
- lowest price renders
- multiple comparison offers render
- Visit Store links are sanitized
- savings tips render
- backend error maps to visible unavailable state

### Product-identification tests
Verify:

- strong Amazon metadata identifies immediately
- weak metadata invokes shared visual fallback
- low-confidence result returns `needs_confirmation`
- incorrect model/spec offers are not highlighted as exact matches

### Side-panel tests
Verify complete sequence:

```text
Scan This Product
→ Product Identified
→ Lowest Price Found
→ Price Comparison
→ Visit Store
→ Savings Tips
```

### Security tests
Verify:

- no provider credentials in extension bundle
- no `<all_urls>` requirement added for routine background access
- no raw page HTML persisted
- only HTTPS backend/store links accepted
- bounded session persistence
- Guardian remains authoritative

### End-to-End Acceptance Test
Using an Amazon product page such as a Garmin watch:

1. User clicks Auction toolbar icon.
2. User clicks `Scan This Product`.
3. Side panel opens automatically.
4. Panel shows a non-idle progress state.
5. Product identity appears without manual image upload.
6. Store search completes.
7. Lowest price appears.
8. Multiple comparison options appear when available.
9. Visit Store links point to sanitized merchant URLs.
10. Savings Tips appear.

## Migration from Current Extension Search Path
The current `searchProviders = []` production path must no longer be the final live source for browser price comparison.

Existing matcher/ranker/Guardian modules can remain useful as client-side defense and deterministic testing layers, but live identification/search data should enter through the shared backend contract.

The service worker should orchestrate:

```text
capture evidence
→ persist scan state
→ call shared Auction backend
→ validate result
→ Guardian-filter offers
→ persist final result
→ broadcast final result
→ side panel renders website-style flow
```

## Non-Goals
This change does not:

- automate checkout
- purchase items
- collect payment credentials
- add arbitrary continuous browsing surveillance
- make the extension scrape every page in the background
- duplicate provider credentials into the browser
- require the user to upload a product image when scanning a product page

## Success Criteria
The feature is complete when a user on a product page can press **Scan This Product** once and, entirely within the Auction sidebar, receive the same logical result flow demonstrated by the Auction website:

- Product Identified
- Product / Brand / Model / Features
- Lowest Price Found
- Price Comparison
- Visit Store links
- Savings Tips

The panel must never remain `idle` after a valid scan request merely because it opened late, and real production comparison results must come from the shared Auction backend rather than an empty local provider list.
