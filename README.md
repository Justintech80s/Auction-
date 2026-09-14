# Auction

Auction is an experimental browser-native shopping assistant and marketplace-intelligence engine. It turns product-page information into structured pricing evidence, valuation ranges, Guardian risk signals, explainable opportunity decisions, and condition-separated cross-store price comparisons.

## Current Status

**Manifest V3 browser extension + explicit Scan This Product flow + cross-store search architecture + valuation/sold-evidence pipeline + Guardian security + Opportunity engine + local watchlist + explicit cost modeling.**

Auction's deterministic matching, ranking, safety, popup, side-panel, valuation, and storage code is contained in the self-contained browser build. Live credentialed visual recognition and live cross-store shopping data require an approved secure backend/provider connection. Provider credentials are never embedded in the extension bundle.

## Browser Shopping Assistant

Current Chromium targets:

- Google Chrome
- Microsoft Edge

Automatic product-page detection remains enabled for:

- eBay US
- Amazon US
- Walmart US
- Best Buy US

Auction v1.0.0 also adds an **explicit one-shot scan** that can be triggered on other normal webpages, including product/image-result pages such as Google Images. Click the Auction **A** and choose **Scan This Product**. Auction uses temporary `activeTab` access for that page only; it does not request permanent `<all_urls>` access or continuously inspect arbitrary browsing.

The extension includes:

- toolbar popup with **Scan This Product** and **Open Auction Sidebar**
- structured-data/title/model/spec/image product evidence collection
- secure visual-recognition provider boundary for weak page evidence
- normalized product identity and offer contracts
- provider-neutral trusted/broader shopping search orchestration
- exact/similar/rejected product matching
- accessory, replacement-part, and material-spec mismatch rejection
- Guardian screening for suspicious or implausible offers
- separate **New**, **Refurbished**, **Used**, and unknown-condition results
- cheapest item-price and cheapest confirmed delivered-total ranking
- unknown shipping kept unknown instead of assumed to be free
- direct merchant **Buy** links without checkout automation
- Auction valuation, sold-evidence, Guardian, Opportunity, cost, preset, and watchlist integration
- deterministic release-security testing

See [`docs/BROWSER_EXTENSION.md`](docs/BROWSER_EXTENSION.md) for architecture, permissions, privacy boundaries, and testing details.

## Download and Install v1.0.0

**[⬇ Download Auction-Browser-Extension-v1.0.0.zip](Auction-Browser-Extension-v1.0.0.zip)**

> **Experimental developer build:** Auction v1.0.0 is for testing/evaluation and is not currently a Chrome Web Store or Microsoft Edge Add-ons production release.

The v1.0.0 release ZIP is **flat/easy-install**: after extracting it, `manifest.json` is directly inside the extracted folder.

1. Download the ZIP and choose **Extract All**.
2. Open `chrome://extensions/` or `edge://extensions/`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the extracted folder where `manifest.json` is directly visible.
6. Do not select the ZIP itself and do not open the `content` folder.
7. Pin Auction if desired, visit a page showing a product, click the **A**, and choose **Scan This Product**.

Full instructions: [`HOW_TO_INSTALL_AUCTION_EXTENSION.md`](HOW_TO_INSTALL_AUCTION_EXTENSION.md).

## Build from Source

Requirements: Node.js 20 or newer.

```bash
git clone https://github.com/Justintech80s/Auction-.git
cd Auction-
npm test
npm run build:extension
```

Load `dist/auction-extension/` with **Load unpacked**. The build step assembles all required Auction runtime modules inside the extension root; do not use the source `extension/` directory as the final release package.

## Scan + Search Flow

```text
User clicks Auction A
        |
        v
Scan This Product
        |
        v
One-shot activeTab scanner
        |
        v
Product Identity
(structured data / model / specs / image fallback)
        |
        v
Trusted + broader shopping providers
        |
        v
Exact-match + Guardian screening
        |
        v
New / Refurbished / Used groups
        |
        +--> Cheapest Item Price
        +--> Cheapest Confirmed Total
        +--> Best Exact Match
        |
        v
Auction Side Panel + Merchant Buy Link
```

If identity confidence is too low, Auction reports **Needs confirmation**. If live shopping providers are unavailable or not configured, Auction reports **Provider unavailable** instead of fabricating prices.

## Analysis and Deal Economics

Auction also provides:

- asking-price versus verified sold-evidence separation
- comparable deduplication and similarity ranking
- robust price-outlier filtering
- evidence-weighted valuation ranges and confidence
- Opportunity decisions: `strong_buy`, `buy`, `fair`, `overpriced`, `avoid`, `manual_review`
- explicit optional costs for marketplace fees, shipping, tax, repairs, payment processing, and holding
- gross and net profit/margin outputs
- locally saved reusable cost presets, including a default preset
- local watchlist storage capped at 200 URL-deduplicated records

Guardian remains authoritative. UI code and optional AI enrichment cannot silently upgrade a deterministic review/reject outcome.

## Privacy and Permissions

Manifest V3 permissions:

- `sidePanel`
- `storage`
- `activeTab`
- `scripting`

Permanent host permissions remain limited to eBay US, Amazon US, Walmart US, and Best Buy US for their fixed product-page content scripts. The explicit scan flow uses temporary `activeTab` permission following the user's click, so Auction does **not** request `<all_urls>`.

The scanner is designed not to collect or persist passwords, payment-card information, checkout contents, private messages, arbitrary browser history, cookies/session tokens, raw full-page HTML, provider credentials, or unrelated page text.

## Live Provider Boundary

No provider credentials belong in GitHub or the browser extension.

The extension contains a secure HTTPS backend connector for two credential-dependent actions:

- `identify_product` — visual/product recognition fallback
- `search_offers` — live cross-store shopping offers

A production backend can connect permitted retailer/shopping APIs behind that boundary. Without a configured provider, the browser code remains deterministic and safe but cannot manufacture live Internet prices.

Existing eBay Browse and Marketplace Insights integrations likewise require approved provider access for live data.

## Release Security

The generated package is tested for:

- self-contained runtime imports inside the extension root
- Manifest V3 and v1.0.0 version alignment
- no `<all_urls>`
- no `eval`, dynamic `Function`, remote scripts/modules, or HTML injection sinks
- no browser-shipped `process.env` dependency
- no obvious committed credentials
- bounded extension messages and normalized page/provider data
- Guardian authority over suspicious search offers
- direct Buy links using normalized HTTPS offer URLs

GitHub Actions runs the full deterministic test suite and builds the extension on each code change. The release workflow builds and verifies a flat ZIP whose archive root contains `manifest.json`.

## Repository Structure

```text
extension/
  manifest.json
  service-worker.js
  popup/
  adapters/
  content/
  messaging/
  sidepanel/
  storage/

src/
  pipeline.js
  valuation.js
  opportunity.js
  product-search/
    contracts.js
    identify.js
    matcher.js
    offer-guardian.js
    ranker.js
    search.js
  connectors/
    product-search-backend.js
  sold-evidence/
  security/
  ai/

scripts/
  build-extension.mjs

test/
  ...deterministic valuation, browser, scan, search, Guardian, UI, storage, and release tests
```

## Known Limitations

- Live cross-store prices and credentialed visual recognition require an approved/configured secure backend/provider; no secrets are packaged with the extension.
- Retailer DOM/layout changes can require adapter maintenance.
- Permanent automatic product-page detection currently targets eBay US, Amazon US, Walmart US, and Best Buy US; arbitrary-page scanning is explicit/user-triggered.
- Safari packaging is not implemented yet.
- Auction does not automate purchasing or checkout.
- The watchlist and cost presets are browser-local rather than account-synced.
- Taxes, final shipping, stock, warranties, seller terms, and checkout totals remain controlled by the merchant.

## Engineering Principles

1. **Evidence over guesses** — uncertainty is shown instead of hidden.
2. **Sold and asking prices are different signals.**
3. **Guardian outranks UI and optional AI.**
4. **External page/provider content is untrusted data.**
5. **Production integrations use permitted APIs/authorized sources and secure credential boundaries.**
6. **Privacy by design** — explicit scan access, bounded evidence, no unnecessary page capture.
7. **Testable boundaries** — scanning, identification, providers, matching, Guardian, ranking, UI, valuation, persistence, and packaging are independently testable.

> A feature is considered implemented here only when corresponding source and reproducible verification are present.
