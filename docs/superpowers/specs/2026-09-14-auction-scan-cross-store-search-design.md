# Auction Scan This Product + Cross-Store Search Design

Date: 2026-09-14
Status: Approved architecture

## Purpose

Add an explicit browser-extension scan flow that starts from the Auction toolbar icon. When the user clicks the Auction `A` and chooses **Scan This Product**, Auction identifies the product visible on the current webpage and searches trusted retailers plus broader permitted shopping sources for comparable offers.

The experience must work on supported retailer pages and on arbitrary pages such as Google Images, blogs, and smaller stores, but only after an explicit user-triggered scan. Auction must not continuously inspect unrelated browsing activity.

## User Experience

1. User clicks the Auction toolbar `A`.
2. Auction opens its own popup.
3. The first action is **Scan This Product**.
4. A secondary action is **Open Auction Sidebar**.
5. When scan starts, Auction gathers product-relevant signals from the active tab.
6. Auction identifies the likely product and opens the Auction side panel.
7. Auction searches for matching offers.
8. Results are grouped into **New**, **Refurbished**, and **Used**.
9. Each condition group shows:
   - cheapest item price,
   - cheapest estimated total including shipping,
   - best exact match,
   - retailer/store,
   - condition,
   - match confidence,
   - availability when known,
   - direct Buy link.
10. Low-confidence identification shows **Needs confirmation** instead of silently guessing.

The browser-controlled extension context menu shown by Chrome/Edge cannot be modified with arbitrary rows. Therefore the `A` click opens an Auction-owned popup containing the scan action.

## Scan Scope and Permissions

Auction must support explicit scan on any webpage without requesting permanent `<all_urls>` access.

Recommended Manifest V3 permissions:

- existing `sidePanel`
- existing `storage`
- `activeTab`
- `scripting`

`activeTab` provides temporary access to the current page following a user gesture. `scripting` allows Auction to execute the one-shot scanner in that explicitly authorized tab. Existing fixed content scripts for eBay, Amazon, Walmart, and Best Buy may remain for automatic supported-product detection.

Auction must not continuously scan arbitrary pages in the background.

## Product Identification

The scan layer combines multiple signals rather than relying on one source.

Priority order:

1. Structured product data present on the page, including JSON-LD/schema.org product fields when available.
2. Strong text identifiers such as brand, exact model number, SKU/MPN/UPC/GTIN, product title, key specs, and condition.
3. Primary visible product image metadata and image URL when permitted.
4. Visual recognition/image similarity through a secure backend provider when structured/text evidence is insufficient.

The output is a normalized `ProductIdentity` object containing bounded fields such as:

- brand
- model
- title
- category
- identifiers
- key specifications
- detected condition
- source URL
- primary image reference
- confidence
- evidence summary

If confidence is below the acceptance threshold, the scan result is `needs_confirmation` and search results must not be labeled as exact matches.

## Shared Identification Contract

The repository currently has browser product detection but does not contain the website photo-upload implementation. The new identification contract should therefore be provider-neutral and reusable by both inputs:

- browser page scan
- future/connected website image upload

Both flows should normalize into the same `ProductIdentity` structure before cross-store search.

## Cross-Store Search Architecture

Search is split into two tiers.

### Tier 1: Trusted retailer/marketplace connectors

Use dedicated connectors or permitted retailer/shopping APIs for major sources where available. Initial target set includes:

- eBay
- Amazon
- Walmart
- Best Buy
- Target
- Newegg

Additional major retailers can be added under the same connector contract.

### Tier 2: Broader shopping/web provider

A backend shopping-search provider may return offers from smaller online stores and additional marketplaces. This layer must use permitted search/API access rather than embedding scraping credentials or unrestricted remote-code behavior in the extension.

Trusted sources rank ahead of broader-web sources when offers are otherwise equivalent. A smaller store may still rank as cheapest when the product match is strong and the source passes Auction safety checks.

## Secure Credential Boundary

Provider credentials must never be stored in the browser extension bundle or committed to GitHub.

Live cross-store search and visual-recognition providers that require credentials must run behind a controlled backend/runtime boundary. The extension sends only the minimum normalized scan request needed for the user-triggered action.

The extension remains functional in deterministic/test mode without live credentials.

## Offer Normalization

Every provider maps results into a shared bounded `Offer` contract:

- source/store
- product title
- canonical URL
- image URL/reference
- condition
- item price
- shipping price when known
- estimated total
- currency
- availability
- identifiers/model/specs
- match score
- source confidence
- trust tier

Unknown shipping must remain unknown; Auction must not invent shipping prices.

## Exact-Match Rules

Auction must compare scanned identity and candidate offers using:

- brand
- exact model/model family
- model/SKU/MPN/UPC/GTIN when available
- category
- key specifications relevant to the category
- condition

Examples of key specs:

- laptops: CPU, RAM, storage, screen size, GPU/configuration
- phones: model generation, storage, carrier/unlocked state
- TVs: model number, size, panel family
- furniture/lighting: manufacturer/model/size/material when available

Candidates with material mismatches are rejected from exact results or clearly labeled **Similar, not exact**.

The matcher must filter likely accessories, replacement parts, empty boxes, unrelated bundles, and misleading near-name matches unless they are explicitly requested.

## Condition Separation

Results must never collapse conditions into one cheapest-price list.

Three first-class groups:

- **New**
- **Refurbished**
- **Used**

Unknown condition is kept separate or marked `unknown`; it must not be silently promoted into one of the three groups.

## Price Ranking

Each condition group exposes two independent rankings:

### Cheapest Item Price

Sort by item price only.

### Cheapest Estimated Total

Sort by item price + known shipping.

If shipping is unknown, Auction must not pretend the total is final. Such offers can remain visible but cannot outrank a confirmed total solely through an assumed zero shipping cost.

Tie-breaking order for materially similar prices:

1. exact product match
2. trusted source tier
3. higher source confidence
4. known availability
5. lower confirmed total

## Guardian and Safety

Auction Guardian remains authoritative.

The scan/search layer feeds evidence into Guardian; it does not replace Guardian or override review/reject outcomes.

Guardian may downgrade or flag offers for:

- suspicious domains
- malformed/redirect-heavy links
- mismatched product identity
- implausible prices
- stale evidence
- missing provenance
- provider errors
- low-confidence product identification

A suspicious offer must not be presented as the recommended cheapest option simply because its numeric price is lowest.

## Toolbar Popup

Add a small extension popup owned by Auction.

Primary controls:

- **Scan This Product**
- **Open Auction Sidebar**

Scan behavior:

1. popup obtains the active tab after the user gesture,
2. requests temporary active-tab access,
3. runs the one-shot product scanner,
4. sends normalized scan evidence through extension messaging,
5. opens/updates the Auction side panel,
6. shows scan/search progress and results there.

The popup should remain intentionally small; full results belong in the side panel.

## Side Panel States

Extend side-panel state handling with:

- ready-to-scan
- scanning-page
- identifying-product
- needs-confirmation
- searching-stores
- partial-results
- complete-results
- no-exact-match
- provider-unavailable
- safe-error

Provider failure must degrade partially: if one retailer/provider fails, successful sources should still render.

## Messaging

Add explicit bounded message types such as:

- `SCAN_ACTIVE_PRODUCT_REQUEST`
- `SCAN_ACTIVE_PRODUCT_RESULT`
- `CROSS_STORE_SEARCH_REQUEST`
- `CROSS_STORE_SEARCH_RESULT`

Payloads must remain size-bounded and sanitized. Raw page HTML must not be sent or persisted.

## Privacy Boundaries

A scan may collect only product-relevant information needed for the explicit request.

Do not collect or persist:

- passwords
- payment/card information
- checkout contents
- private messages
- unrelated page text
- arbitrary browser history
- cookies/session tokens
- provider credentials
- full raw HTML snapshots

The scan should prefer structured fields and a bounded subset of visible product metadata.

## Storage

Cross-store search results are ephemeral by default.

If the user explicitly saves a product to the existing watchlist, store only the bounded normalized product/analysis summary allowed by current watchlist rules. Do not persist full provider responses or raw page data.

## Failure Handling

### Product cannot be identified

Return `needs_confirmation` or `unidentified`; do not fabricate a model.

### No exact offers

Show **No exact match found** and optionally display clearly separated similar results.

### One provider fails

Render results from remaining providers and mark the failed source unavailable.

### Backend unavailable

Show a safe retry state. Existing local valuation/watchlist behavior must remain usable where possible.

### Shipping unknown

Show item price and `Shipping unknown`; do not calculate a fake total.

## Testing Strategy

Implementation follows TDD and must add deterministic tests before production code.

Required coverage:

### Popup and permission tests

- toolbar popup contains Scan This Product
- scan requires explicit user action
- active-tab scan does not require `<all_urls>`
- unsupported/restricted pages fail safely

### Scanner tests

- eBay product page
- Amazon product page
- Walmart product page
- Best Buy product page
- Google Images/product-result style page
- smaller store page
- structured data preferred over weak visual evidence
- bounded metadata extraction
- no raw unrelated page content in payload

### Identification tests

- exact model identification
- strong identifier match
- visual fallback
- conflicting evidence
- low confidence => needs confirmation

### Offer matching tests

- exact model accepted
- wrong model rejected
- wrong storage/RAM/size rejected
- accessories/parts rejected
- near-match labeled similar
- duplicate offers normalized/deduplicated

### Condition tests

- New / Refurbished / Used remain separate
- unknown condition never silently reclassified

### Price tests

- cheapest item price correct
- cheapest confirmed total correct
- shipping included only when known
- unknown shipping cannot win via assumed zero

### Trust and Guardian tests

- trusted source tie-break
- suspicious low-price source does not override Guardian
- partial provider outage still returns remaining offers
- malformed links rejected

### End-to-end extension tests

- click A -> popup -> Scan This Product -> page scan -> identification -> cross-store search -> side-panel results
- Buy link points to normalized offer URL
- extension build/security gate remains green
- no provider credential appears in built package

## Initial Implementation Boundaries

This feature does not automate purchasing or checkout.

The Buy action navigates the user to the external merchant offer. Final price, taxes, shipping, stock, seller terms, warranties, and checkout remain controlled by the merchant.

The first production iteration should prioritize deterministic product matching and provider-neutral interfaces over adding a large number of weak data sources.

## Success Criteria

The feature is ready when a user can:

1. visit a product or image page,
2. click the Auction `A`,
3. choose **Scan This Product**,
4. have Auction identify the product without a manual screenshot upload,
5. see cross-store offers grouped by New / Refurbished / Used,
6. see both cheapest item price and cheapest known delivered total,
7. distinguish exact from similar matches,
8. follow a Buy link to a real merchant offer,
9. receive explicit uncertainty when identification/search evidence is weak,
10. use the feature without embedding provider credentials or granting permanent access to every webpage.
