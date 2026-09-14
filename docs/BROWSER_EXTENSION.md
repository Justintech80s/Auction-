# Auction Browser Extension

Auction v1.0.0 is a Chromium Manifest V3 shopping assistant with two complementary entry paths:

1. fixed product-page detection on eBay US, Amazon US, Walmart US, and Best Buy US;
2. an explicit **Scan This Product** action that can inspect one user-authorized normal webpage through `activeTab`.

The browser layer collects bounded product evidence and renders results. Auction's deterministic valuation, matching, ranking, Guardian, sold-evidence, Opportunity, and cost logic remain authoritative.

## Install the Ready-to-Use ZIP

Download [`Auction-Browser-Extension-v1.0.0.zip`](../Auction-Browser-Extension-v1.0.0.zip), choose **Extract All**, then use **Load unpacked** in `chrome://extensions/` or `edge://extensions/` and select the extracted folder that directly contains `manifest.json`.

The release ZIP is intentionally flat: there is no extra `auction-extension` wrapper inside it.

For the complete install walkthrough, see [`HOW_TO_INSTALL_AUCTION_EXTENSION.md`](../HOW_TO_INSTALL_AUCTION_EXTENSION.md).

## Build from Source

Requirements: Node.js 20 or newer.

```bash
git clone https://github.com/Justintech80s/Auction-.git
cd Auction-
npm test
npm run build:extension
```

Load `dist/auction-extension/` with **Load unpacked**. The builder copies the required Auction modules into that self-contained package and rewrites runtime imports so nothing escapes the loaded extension folder.

## Toolbar Scan Flow

```text
Auction A
  -> Scan This Product
  -> active tab only
  -> bounded product evidence
  -> identify product
  -> search configured shopping providers
  -> exact/similar matching
  -> Guardian screening
  -> New / Refurbished / Used groups
  -> side-panel prices + Buy links
```

The one-shot scanner prefers structured Product JSON-LD and strong model/identifier/spec data. It can include a primary product image reference when available. Weak evidence can be sent to a configured secure visual-recognition backend. If confidence remains insufficient, Auction returns **Needs confirmation** rather than guessing.

## Search and Matching

Shopping providers implement a provider-neutral offer interface. Auction can preserve successful sources when another source fails and reports partial availability without leaking provider errors.

Offers are normalized into bounded fields including store, title, HTTPS URL, model/specs, condition, item price, known shipping, availability, source trust tier, and source confidence.

Product matching rejects or downgrades:

- conflicting model/SKU/MPN/UPC/GTIN information
- material RAM/storage/size/configuration mismatches
- accessories and replacement parts
- empty-box/parts-only listings
- unrelated near-name results

Results remain separated as **New**, **Refurbished**, **Used**, and unknown condition. Unknown condition is never silently promoted.

Each condition group independently tracks:

- cheapest item price
- cheapest confirmed delivered total
- best exact match

Unknown shipping stays unknown and cannot win the confirmed-total ranking by being treated as zero.

Guardian review/reject offers may remain visible for transparency, but they cannot become Auction's recommended cheapest/best-exact result.

## Side Panel States

The scan/search UI supports:

- searching stores
- needs confirmation
- complete results
- partial results
- no exact match
- provider unavailable
- safe error

Each offer can display store, price, known shipping/total, exact or similar match state, match confidence, Guardian state, availability, and a direct HTTPS **Buy** link. The link opens the merchant; Auction does not automate purchasing or checkout.

The existing valuation, cost-preset, net-profit, and local-watchlist side-panel behavior remains available.

## Permissions

`manifest.json` requests:

- `sidePanel` — Auction's result/analysis panel
- `storage` — bounded browser-local watchlist and cost presets
- `activeTab` — temporary access to the active page following the user's scan gesture
- `scripting` — executes the one-shot product scanner in that authorized tab

Permanent host permissions are still limited to:

- `https://www.ebay.com/*`
- `https://www.amazon.com/*`
- `https://www.walmart.com/*`
- `https://www.bestbuy.com/*`

Auction does **not** request `<all_urls>`. The explicit scan does not create continuous arbitrary-page monitoring.

## Privacy Boundary

The scanner is designed to collect only bounded product-relevant evidence. It does not intentionally collect or persist:

- passwords
- payment/card data
- checkout contents
- private messages
- cookies/session tokens
- arbitrary browser history
- full raw HTML snapshots
- unrelated page text
- provider credentials

Cross-store search responses are ephemeral by default. The existing watchlist stores only its bounded normalized product/analysis summary when the user explicitly saves an item.

## Secure Live-Provider Boundary

Credentials never belong in the extension or GitHub.

`src/connectors/product-search-backend.js` provides an HTTPS-only browser/backend boundary for:

- `identify_product`
- `search_offers`

Requests are normalized before transmission and upstream failures are reduced to safe public errors. A production backend can connect authorized visual/shopping APIs without exposing secrets to the extension.

Without that configured live backend/provider, Auction deliberately returns **Needs confirmation** or **Provider unavailable** instead of fabricating live cross-store prices. Deterministic tests and local matching/ranking logic do not require credentials.

## Existing Valuation Pipeline

Fixed supported product pages can still flow through Auction's established valuation path:

```text
Product Page
  -> site adapter
  -> normalized product
  -> service worker
  -> valuation + sold evidence + Guardian + Opportunity + costs
  -> side panel
  -> optional local Save
```

Active listings remain asking-price evidence. Verified sales are accepted only through the sold-evidence layer and its provenance/verification checks.

## Testing and Release Gate

Run:

```bash
npm test
npm run build:extension
```

Coverage includes:

- fixed marketplace adapters and SPA observation
- explicit arbitrary-page `activeTab` scanning
- Google Images/product-image style evidence
- no raw unrelated page capture
- product-identification confidence and visual fallback boundary
- size-bounded messaging
- cross-store provider partial failure
- exact/similar/rejected matching
- accessory and spec-conflict filtering
- New / Refurbished / Used separation
- cheapest item vs confirmed total
- Guardian search-offer screening
- side-panel result states and safe Buy links
- existing valuation, watchlist, cost, and preset behavior
- self-contained release imports
- no `<all_urls>`
- no dynamic executable code, remote scripts/modules, common HTML injection sinks, browser-shipped `process.env`, or obvious credential material

The main-branch release workflow builds `Auction-Browser-Extension-v1.0.0.zip`, verifies ZIP integrity, checks that `manifest.json` is directly at archive root, confirms Manifest V3/version 1.0.0, and publishes the verified ZIP back to the repository.

## Known Limitations

- Live cross-store prices and credentialed visual recognition require an approved configured backend/provider.
- Permanent automatic product-page adapters currently target the four U.S. shopping domains above; other webpages use explicit scanning.
- Retail DOM/layout changes can require adapter maintenance.
- Safari packaging is not included.
- Auction does not automate checkout or guarantee final merchant totals/availability.
- Browser-local watchlist/cost presets do not sync between devices.
