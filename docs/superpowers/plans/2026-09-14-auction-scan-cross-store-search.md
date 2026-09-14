# Auction Scan This Product + Cross-Store Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an explicit Auction toolbar scan that identifies the product on the active webpage and shows safely matched cross-store offers grouped into New, Refurbished, and Used with both item-price and delivered-total rankings.

**Architecture:** Keep the browser extension thin and permission-bounded. A one-shot page scanner creates a normalized `ProductIdentity`; extension messaging sends it to a provider-neutral cross-store search engine; offer normalization/matching rejects materially different products; the service worker coordinates scan/search/valuation; the side panel renders condition-separated offers while Auction Guardian remains authoritative. Credentialed shopping or visual-recognition providers stay behind a secure backend boundary and are injected through a connector contract rather than embedded in the extension.

**Tech Stack:** JavaScript ES modules, Chrome/Edge Manifest V3, `activeTab`, `scripting`, Side Panel API, Node.js 20+, built-in `node:test`, existing Auction Guardian/valuation pipeline.

**Spec:** `docs/superpowers/specs/2026-09-14-auction-scan-cross-store-search-design.md`

## Global Constraints

- Scan starts only from an explicit user action; arbitrary webpages must not be continuously inspected.
- Do not add `<all_urls>`.
- Add only `activeTab` and `scripting` to the existing extension permissions required for one-shot arbitrary-page scans.
- Existing fixed content scripts for eBay, Amazon, Walmart, and Best Buy may continue automatic supported-page detection.
- Raw page HTML, cookies, session tokens, checkout data, payment data, private messages, and unrelated browsing content must never cross the scan boundary.
- Product identity and extension messages remain bounded and JSON-serializable.
- New, Refurbished, Used, and Unknown conditions remain distinct.
- Unknown shipping stays unknown and must not be treated as zero when ranking confirmed delivered totals.
- Exact-match status must consider identifiers, model, category, and material category-specific specifications.
- Accessories, replacement parts, empty boxes, and materially different configurations cannot be promoted as exact matches.
- Guardian remains authoritative; a suspicious low-price offer must not become the recommended cheapest option merely because its numeric price is low.
- Provider credentials must never be included in the extension package or committed to GitHub.
- Live credentialed shopping/visual providers require a secure backend endpoint; absence of that endpoint must degrade to `provider_unavailable` without breaking existing valuation/watchlist behavior.
- No checkout or purchasing automation.
- Every task follows TDD: failing test, minimal implementation, passing test, commit.

---

## Planned File Structure

```text
extension/
  manifest.json
  popup/
    index.html
    app.js
    styles.css
  content/
    active-scan.js
  messaging/
    messages.js
  sidepanel/
    index.html
    app.js
    styles.css
    view-model.js
  service-worker.js

src/
  product-search/
    contracts.js
    matcher.js
    ranker.js
    search.js
  connectors/
    shopping-backend.js

scripts/
  build-extension.mjs

test/
  product-search-contracts.test.js
  extension-active-scan.test.js
  extension-popup.test.js
  extension-messaging.test.js
  product-search-matcher.test.js
  product-search-ranker.test.js
  shopping-backend-connector.test.js
  product-search-orchestration.test.js
  extension-cross-store-integration.test.js
  extension-view-model.test.js
  extension-release-security.test.js
  extension-integration.test.js
```

`src/product-search/` owns provider-neutral identity, offer, match, and ranking behavior. `extension/content/active-scan.js` owns bounded extraction from the active page. `extension/popup/` owns the explicit user gesture. The service worker only orchestrates; it does not duplicate scanner or matching rules. The side panel displays already-normalized results.

---

### Task 1: ProductIdentity and Offer Contracts

**Files:**
- Create: `src/product-search/contracts.js`
- Create: `test/product-search-contracts.test.js`

**Interfaces:**
- Produces: `normalizeProductIdentity(input, context) -> ProductIdentity`
- Produces: `normalizeOffer(input) -> Offer`
- Produces: `normalizeCondition(value) -> 'new' | 'refurbished' | 'used' | 'unknown'`
- Later tasks consume these exact exports.

- [ ] **Step 1: Write failing contract tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCondition, normalizeOffer, normalizeProductIdentity } from '../src/product-search/contracts.js';

test('normalizes a bounded product identity', () => {
  const identity = normalizeProductIdentity({
    title: 'Dell Latitude 7420', brand: 'Dell', model: 'Latitude 7420',
    category: 'Laptop', condition: 'Certified Refurbished',
    identifiers: { mpn: 'LAT7420' },
    specs: { ram: '16GB', storage: '512GB SSD' },
    sourceUrl: 'https://www.ebay.com/itm/123',
    imageUrl: 'https://i.ebayimg.com/images/example.jpg', confidence: 0.94
  }, { now: new Date('2026-09-14T12:00:00Z') });
  assert.equal(identity.condition, 'refurbished');
  assert.equal(identity.identifiers.mpn, 'LAT7420');
  assert.equal(identity.specs.ram, '16GB');
  assert.equal(identity.confidence, 0.94);
});

test('normalizes an offer without inventing shipping', () => {
  const offer = normalizeOffer({
    source: 'store-a', sourceId: '1', title: 'Dell Latitude 7420',
    url: 'https://shop.example/item/1', condition: 'Used',
    itemPrice: 220, shipping: null, currency: 'USD', trustTier: 'broad'
  });
  assert.equal(offer.condition, 'used');
  assert.equal(offer.shipping, null);
  assert.equal(offer.estimatedTotal, null);
});

assert.equal(normalizeCondition('Brand New'), 'new');
assert.equal(normalizeCondition('Open box'), 'unknown');
```

- [ ] **Step 2: Run the focused test and verify the module is missing**

Run: `node --test test/product-search-contracts.test.js`

Expected: FAIL because `src/product-search/contracts.js` does not exist.

- [ ] **Step 3: Implement bounded contracts**

Implement `src/product-search/contracts.js` with these exported constants/signatures:

```js
export const PRODUCT_CONDITIONS = Object.freeze(['new', 'refurbished', 'used', 'unknown']);
export function normalizeCondition(value) {}
export function normalizeProductIdentity(input, context = {}) {}
export function normalizeOffer(input) {}
```

Required limits: title 512 chars; brand/model 128; category 256; identifiers max 20 entries, 256 chars each; specs max 24 entries, 256 chars each; URLs HTTPS only; confidence finite from 0 through 1; currency USD in this iteration. `normalizeOffer` computes `estimatedTotal` only when both item price and shipping are known finite non-negative values.

- [ ] **Step 4: Run focused tests**

Run: `node --test test/product-search-contracts.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/product-search/contracts.js test/product-search-contracts.test.js
git commit -m "feat: add product search contracts"
```

---

### Task 2: One-Shot Active-Page Product Scanner

**Files:**
- Create: `extension/content/active-scan.js`
- Create: `test/extension-active-scan.test.js`
- Reuse: `extension/adapters/generic.js`

**Interfaces:**
- Consumes: `normalizeProductIdentity(input, context)` from Task 1.
- Produces: `scanActiveProduct({ documentLike, locationLike, now }) -> { status, identity, evidence }`.
- Evidence is bounded metadata only; no raw HTML.

- [ ] **Step 1: Write failing scanner tests for structured data, page metadata, image pages, and privacy**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { scanActiveProduct } from '../extension/content/active-scan.js';

test('prefers structured Product JSON-LD', () => {
  const doc = fakeDocumentWithProductJsonLd({
    name: 'Dell Latitude 7420', brand: { name: 'Dell' }, model: 'Latitude 7420',
    sku: 'LAT7420', image: 'https://images.example/dell.jpg'
  });
  const result = scanActiveProduct({ documentLike: doc, locationLike: { href: 'https://shop.example/dell' } });
  assert.equal(result.status, 'identified');
  assert.equal(result.identity.model, 'Latitude 7420');
});

test('returns needs_confirmation for an image-result page with weak evidence', () => {
  const doc = fakeImagePage({ title: 'Dell laptop image', imageUrl: 'https://images.example/dell.jpg' });
  const result = scanActiveProduct({ documentLike: doc, locationLike: { href: 'https://www.google.com/search?q=dell&tbm=isch' } });
  assert.equal(result.status, 'needs_confirmation');
  assert.ok(result.identity.imageUrl);
});

test('never includes raw html, card numbers, cookies, or unrelated body text', () => {
  const result = scanActiveProduct({ documentLike: fakeSensitivePage(), locationLike: { href: 'https://example.com/item' } });
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes('4111111111111111'), false);
  assert.equal(serialized.includes('session='), false);
  assert.equal('html' in result, false);
});
```

The test helper must implement only `querySelector`, `querySelectorAll`, `title`, and bounded node attributes/text used by the scanner; do not use jsdom.

- [ ] **Step 2: Verify tests fail**

Run: `node --test test/extension-active-scan.test.js`

Expected: FAIL because the scanner module is missing.

- [ ] **Step 3: Implement the scanner**

`scanActiveProduct` uses this evidence priority:

```js
const EVIDENCE_PRIORITY = Object.freeze([
  'structured_product',
  'strong_identifiers',
  'page_metadata',
  'primary_image'
]);
```

Extract allowlisted JSON-LD Product fields, schema/OpenGraph title/image, model/SKU/MPN/GTIN text when explicitly labeled, a bounded page title, and one primary product-image URL. Never serialize `document.body`, forms, inputs, scripts other than JSON-LD Product records, cookies, or browser history. Confidence `>= 0.75` returns `identified`; lower non-zero evidence returns `needs_confirmation`; no usable evidence returns `unidentified`.

- [ ] **Step 4: Run scanner tests plus existing adapter/scanner tests**

Run: `node --test test/extension-active-scan.test.js test/extension-adapters.test.js test/extension-scanner.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add extension/content/active-scan.js test/extension-active-scan.test.js
git commit -m "feat: add explicit active page product scan"
```

---

### Task 3: Scan and Cross-Store Message Contracts

**Files:**
- Modify: `extension/messaging/messages.js`
- Modify: `test/extension-messaging.test.js`

**Interfaces:**
- Add exact message keys:
  - `SCAN_ACTIVE_PRODUCT_REQUEST: 'AUCTION_SCAN_ACTIVE_PRODUCT_REQUEST'`
  - `SCAN_ACTIVE_PRODUCT_RESULT: 'AUCTION_SCAN_ACTIVE_PRODUCT_RESULT'`
  - `CROSS_STORE_SEARCH_REQUEST: 'AUCTION_CROSS_STORE_SEARCH_REQUEST'`
  - `CROSS_STORE_SEARCH_RESULT: 'AUCTION_CROSS_STORE_SEARCH_RESULT'`
- Existing 64 KiB maximum remains authoritative.

- [ ] **Step 1: Add failing message-validation tests**

```js
test('scan and cross-store messages keep only normalized bounded fields', () => {
  const request = createExtensionMessage(MESSAGE_TYPES.CROSS_STORE_SEARCH_REQUEST, {
    identity: sampleIdentity(), rawHtml: '<form>secret</form>'
  });
  assert.equal(request.type, 'AUCTION_CROSS_STORE_SEARCH_REQUEST');
  assert.equal('rawHtml' in request.payload, false);
  assert.equal(request.payload.identity.model, 'Latitude 7420');
});

test('cross-store result rejects oversized offer payloads', () => {
  assert.throws(() => createExtensionMessage(MESSAGE_TYPES.CROSS_STORE_SEARCH_RESULT, {
    identity: sampleIdentity(), offers: Array.from({ length: 500 }, (_, i) => sampleOffer(i)), providerErrors: []
  }), /maximum size/i);
});
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `node --test test/extension-messaging.test.js`

Expected: FAIL because the new types are unsupported.

- [ ] **Step 3: Extend message normalization**

Use Task 1 contracts to normalize identities and offers. Limit cross-store results to 60 offers total and provider-error records to `{ source, code }` with each string <= 64 chars. Scan request payload is `{ tabId }` where `tabId` is a positive integer. Scan result payload is `{ status, identity }`, with identity nullable only for `unidentified`.

- [ ] **Step 4: Run focused and integration messaging tests**

Run: `node --test test/extension-messaging.test.js test/extension-integration.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add extension/messaging/messages.js test/extension-messaging.test.js
git commit -m "feat: add scan and cross-store messages"
```

---

### Task 4: Auction Toolbar Popup and Explicit Permissions

**Files:**
- Create: `extension/popup/index.html`
- Create: `extension/popup/app.js`
- Create: `extension/popup/styles.css`
- Create: `test/extension-popup.test.js`
- Modify: `extension/manifest.json`
- Modify: `scripts/build-extension.mjs`
- Modify: `test/extension-integration.test.js`
- Modify: `test/extension-release-security.test.js`

**Interfaces:**
- Produces: `createPopupApp({ documentLike, tabs, runtime, sidePanel })`.
- Popup primary action sends `SCAN_ACTIVE_PRODUCT_REQUEST` for the active tab and opens the Auction side panel.

- [ ] **Step 1: Write failing popup and manifest tests**

```js
test('manifest adds explicit scan permissions without all_urls', async () => {
  const manifest = JSON.parse(await readFile(new URL('../extension/manifest.json', import.meta.url), 'utf8'));
  assert.deepEqual(manifest.permissions, ['sidePanel', 'storage', 'activeTab', 'scripting']);
  assert.equal(manifest.action.default_popup, 'popup/index.html');
  assert.equal(JSON.stringify(manifest).includes('<all_urls>'), false);
});

test('Scan This Product targets only the current active tab', async () => {
  const harness = popupHarness({ tabId: 42 });
  const app = createPopupApp(harness.dependencies);
  await harness.click('scan-product');
  assert.deepEqual(harness.sent[0].payload, { tabId: 42 });
  assert.deepEqual(harness.openedPanels, [{ tabId: 42 }]);
  app.destroy();
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `node --test test/extension-popup.test.js test/extension-integration.test.js test/extension-release-security.test.js`

Expected: FAIL because popup files/action and permissions do not exist.

- [ ] **Step 3: Implement popup and manifest changes**

`extension/popup/index.html` contains exactly two primary user actions:

```html
<button id="scan-product" type="button">Scan This Product</button>
<button id="open-sidebar" type="button">Open Auction Sidebar</button>
<p id="popup-status" aria-live="polite"></p>
```

`createPopupApp` gets the active tab with `tabs.query({ active: true, currentWindow: true })`; rejects missing/restricted tabs safely; opens the side panel from the user click; sends the validated scan request. The popup never performs network search itself.

Update `COPY_DIRECTORIES` in `scripts/build-extension.mjs` to include `popup`.

- [ ] **Step 4: Run popup/security/build tests**

Run: `node --test test/extension-popup.test.js test/extension-integration.test.js test/extension-release-security.test.js && npm run build:extension`

Expected: PASS; built package contains `popup/index.html` and still contains no `<all_urls>`.

- [ ] **Step 5: Commit**

```bash
git add extension/popup extension/manifest.json scripts/build-extension.mjs test/extension-popup.test.js test/extension-integration.test.js test/extension-release-security.test.js
git commit -m "feat: add Auction scan toolbar popup"
```

---

### Task 5: Exact-Match Scoring, Condition Separation, and Price Ranking

**Files:**
- Create: `src/product-search/matcher.js`
- Create: `src/product-search/ranker.js`
- Create: `test/product-search-matcher.test.js`
- Create: `test/product-search-ranker.test.js`

**Interfaces:**
- Consumes: normalized ProductIdentity and Offer from Task 1.
- Produces: `matchOffer(identity, offer) -> { classification, score, reasons }` where classification is `exact | similar | rejected`.
- Produces: `rankOffers(identity, offers, options) -> { new, refurbished, used, unknown }`.

- [ ] **Step 1: Write failing matcher tests**

```js
test('accepts an exact laptop configuration', () => {
  const match = matchOffer(dellIdentity(), dellOffer({ specs: { ram: '16GB', storage: '512GB SSD' } }));
  assert.equal(match.classification, 'exact');
});

test('rejects materially different RAM or storage', () => {
  assert.equal(matchOffer(dellIdentity(), dellOffer({ specs: { ram: '8GB', storage: '256GB SSD' } })).classification, 'rejected');
});

test('rejects accessories and replacement parts', () => {
  assert.equal(matchOffer(dellIdentity(), dellOffer({ title: 'Dell Latitude 7420 replacement keyboard' })).classification, 'rejected');
});
```

Matching priority: exact shared identifiers; exact brand/model; category agreement; category-specific key specs. A missing spec lowers confidence but does not equal a conflict. A conflicting key spec rejects exact classification.

- [ ] **Step 2: Write failing ranking tests**

```js
test('keeps conditions separate and exposes both cheapest rankings', () => {
  const ranked = rankOffers(dellIdentity(), [
    dellOffer({ sourceId: 'new-1', condition: 'new', itemPrice: 400, shipping: 0 }),
    dellOffer({ sourceId: 'used-1', condition: 'used', itemPrice: 200, shipping: 25 }),
    dellOffer({ sourceId: 'used-2', condition: 'used', itemPrice: 210, shipping: 0 })
  ]);
  assert.equal(ranked.new.cheapestItem.sourceId, 'new-1');
  assert.equal(ranked.used.cheapestItem.sourceId, 'used-1');
  assert.equal(ranked.used.cheapestTotal.sourceId, 'used-2');
});

test('unknown shipping cannot beat a confirmed delivered total by assumed zero', () => {
  const ranked = rankOffers(dellIdentity(), [
    dellOffer({ sourceId: 'unknown-ship', itemPrice: 180, shipping: null }),
    dellOffer({ sourceId: 'confirmed', itemPrice: 190, shipping: 5 })
  ]);
  assert.equal(ranked.used.cheapestTotal.sourceId, 'confirmed');
});
```

- [ ] **Step 3: Run matcher/ranker tests and verify failure**

Run: `node --test test/product-search-matcher.test.js test/product-search-ranker.test.js`

Expected: FAIL because matcher/ranker modules are missing.

- [ ] **Step 4: Implement matcher and ranker**

Trusted source ordering is `trusted` before `broad` only as a tie-break after product-match classification. Guardian-blocked offers are excluded from recommended cheapest selections but retained in a separate flagged list for explainability. `rankOffers` must not change an offer condition.

- [ ] **Step 5: Run focused tests**

Run: `node --test test/product-search-matcher.test.js test/product-search-ranker.test.js`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/product-search/matcher.js src/product-search/ranker.js test/product-search-matcher.test.js test/product-search-ranker.test.js
git commit -m "feat: add product match and offer ranking"
```

---

### Task 6: Provider-Neutral Cross-Store Search Orchestrator

**Files:**
- Create: `src/product-search/search.js`
- Create: `src/connectors/shopping-backend.js`
- Create: `test/product-search-orchestration.test.js`
- Create: `test/shopping-backend-connector.test.js`

**Interfaces:**
- Produces: `assertShoppingProvider(provider)` requiring `{ name, trustTier, searchOffers(identity, options) }`.
- Produces: `searchAcrossStores(identity, { providers, timeoutMs }) -> { offers, providerErrors }`.
- Produces: `createShoppingBackendConnector({ endpoint, allowedHost, fetchImpl, timeoutMs })`.

- [ ] **Step 1: Write failing orchestration tests**

```js
test('returns successful provider offers when another provider fails', async () => {
  const result = await searchAcrossStores(dellIdentity(), {
    providers: [
      { name: 'trusted-a', trustTier: 'trusted', async searchOffers() { return [dellOffer({ source: 'trusted-a' })]; } },
      { name: 'broken', trustTier: 'broad', async searchOffers() { throw new Error('secret upstream'); } }
    ]
  });
  assert.equal(result.offers.length, 1);
  assert.deepEqual(result.providerErrors, [{ source: 'broken', code: 'provider_unavailable' }]);
  assert.equal(JSON.stringify(result).includes('secret upstream'), false);
});
```

- [ ] **Step 2: Write failing backend-connector tests**

```js
test('backend connector sends only normalized identity and accepts normalized offers', async () => {
  let body;
  const connector = createShoppingBackendConnector({
    endpoint: 'https://search.auction.example/api/offers',
    allowedHost: 'search.auction.example',
    fetchImpl: async (_url, options) => {
      body = JSON.parse(options.body);
      return { ok: true, json: async () => ({ offers: [rawBackendOffer()] }) };
    }
  });
  await connector.searchOffers(dellIdentity());
  assert.equal('rawHtml' in body, false);
  assert.equal(body.identity.model, 'Latitude 7420');
});
```

Use the synthetic `auction.example` host only inside deterministic tests; production runtime must supply a real approved backend endpoint through dependency/configuration injection and must not silently substitute an unrelated public scraper.

- [ ] **Step 3: Run tests and verify failure**

Run: `node --test test/product-search-orchestration.test.js test/shopping-backend-connector.test.js`

Expected: FAIL because the modules are missing.

- [ ] **Step 4: Implement provider isolation and backend connector**

`searchAcrossStores` executes providers independently, bounds each provider to at most 30 raw offers, normalizes all offers, deduplicates by canonical URL plus source ID, and converts provider exceptions to safe error codes. `shopping-backend.js` validates HTTPS/allowed host, POSTs `{ identity }`, uses `redirect: 'error'`, aborts on timeout, and accepts only `{ offers: [] }`.

The connector contract is the secure boundary for major-retailer APIs, broader shopping search, and optional visual recognition. Credentials live behind that endpoint, not in extension code.

- [ ] **Step 5: Run focused tests**

Run: `node --test test/product-search-orchestration.test.js test/shopping-backend-connector.test.js`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/product-search/search.js src/connectors/shopping-backend.js test/product-search-orchestration.test.js test/shopping-backend-connector.test.js
git commit -m "feat: add cross-store search orchestration"
```

---

### Task 7: Service-Worker Scan/Search Orchestration

**Files:**
- Modify: `extension/service-worker.js`
- Create: `test/extension-cross-store-integration.test.js`
- Modify: `test/extension-integration.test.js`

**Interfaces:**
- `createAuctionServiceWorker` gains injectable `scripting`, `tabs`, `sidePanel`, and `crossStoreSearch` dependencies.
- `SCAN_ACTIVE_PRODUCT_REQUEST` executes `scanActiveProduct` in only the requested active tab.
- `CROSS_STORE_SEARCH_REQUEST` invokes the Task 6 search function.

- [ ] **Step 1: Write failing end-to-end worker test**

```js
test('scan request executes one-shot scanner then returns condition-ranked offers', async () => {
  const harness = workerHarness({ tabId: 42, identity: dellIdentity() });
  const worker = createAuctionServiceWorker({
    runtime: harness.runtime,
    scripting: harness.scripting,
    crossStoreSearch: async () => ({ offers: [dellOffer({ sourceId: 'used-1' })], providerErrors: [] })
  });
  worker.start();
  const scan = await harness.dispatch(createExtensionMessage(MESSAGE_TYPES.SCAN_ACTIVE_PRODUCT_REQUEST, { tabId: 42 }));
  assert.equal(scan.type, MESSAGE_TYPES.SCAN_ACTIVE_PRODUCT_RESULT);
  assert.equal(scan.payload.identity.model, 'Latitude 7420');
  const search = await harness.dispatch(createExtensionMessage(MESSAGE_TYPES.CROSS_STORE_SEARCH_REQUEST, { identity: scan.payload.identity }));
  assert.equal(search.type, MESSAGE_TYPES.CROSS_STORE_SEARCH_RESULT);
  assert.equal(search.payload.offers.length, 1);
});
```

- [ ] **Step 2: Run integration tests and verify failure**

Run: `node --test test/extension-cross-store-integration.test.js test/extension-integration.test.js`

Expected: FAIL because the worker handles analysis only.

- [ ] **Step 3: Implement bounded worker routing**

Keep existing Auction analysis routing unchanged. Add a dedicated router that validates every message before work. For scan, call `scripting.executeScript({ target: { tabId }, func: scanFunction })` only for the user-selected tab; convert restricted-page/browser-internal-page failures to `unidentified`/safe error states. Do not send full document content to the worker.

For cross-store search, return normalized offers plus provider errors. Search failure must not stop the existing valuation handler.

- [ ] **Step 4: Run integration tests**

Run: `node --test test/extension-cross-store-integration.test.js test/extension-integration.test.js test/extension-messaging.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add extension/service-worker.js test/extension-cross-store-integration.test.js test/extension-integration.test.js
git commit -m "feat: orchestrate product scan and cross-store search"
```

---

### Task 8: Side-Panel Search States and New/Refurbished/Used Results

**Files:**
- Modify: `extension/sidepanel/index.html`
- Modify: `extension/sidepanel/app.js`
- Modify: `extension/sidepanel/view-model.js`
- Modify: `extension/sidepanel/styles.css`
- Modify: `test/extension-view-model.test.js`
- Create: `test/extension-cross-store-ui.test.js`

**Interfaces:**
- Produces: `buildSearchViewModel(identity, searchResult)`.
- Existing `buildAnalysisViewModel` remains backward compatible.
- Side panel states include: `ready-to-scan`, `scanning-page`, `identifying-product`, `needs-confirmation`, `searching-stores`, `partial-results`, `complete-results`, `no-exact-match`, `provider-unavailable`, `safe-error`.

- [ ] **Step 1: Write failing view-model tests**

```js
test('builds separate new refurbished and used sections', () => {
  const vm = buildSearchViewModel(dellIdentity(), rankedFixture());
  assert.equal(vm.sections.new.label, 'New');
  assert.equal(vm.sections.refurbished.label, 'Refurbished');
  assert.equal(vm.sections.used.label, 'Used');
  assert.equal(vm.sections.used.cheapestItem.priceLabel, '$220.00');
  assert.equal(vm.sections.used.cheapestTotal.priceLabel, '$235.00');
});
```

- [ ] **Step 2: Write failing UI behavior test**

```js
test('renders Buy links only from normalized offer URLs', async () => {
  const harness = sidePanelHarness();
  const app = createSidePanelApp(harness.dependencies);
  await harness.emitCrossStoreResult(searchResultFixture());
  const links = harness.offerLinks();
  assert.ok(links.length > 0);
  assert.ok(links.every(link => link.href.startsWith('https://')));
  app.destroy();
});
```

- [ ] **Step 3: Run UI tests and verify failure**

Run: `node --test test/extension-view-model.test.js test/extension-cross-store-ui.test.js`

Expected: FAIL because search view-model/result UI is absent.

- [ ] **Step 4: Implement side-panel search UI**

Add a search-results section above existing valuation/cost controls. Render three first-class condition tabs/sections plus Unknown only when present. Each offer card shows store, title, item price, shipping or `Shipping unknown`, estimated total when confirmed, match label, trust/source state, and a safe external `Buy` link. Flagged Guardian offers must display warning state and cannot receive the `Cheapest recommended` badge.

Do not recompute matching, Guardian, or price ranks in DOM code; the view-model consumes normalized/ranked data.

- [ ] **Step 5: Run UI + existing preset/watchlist regression tests**

Run: `node --test test/extension-view-model.test.js test/extension-cross-store-ui.test.js test/extension-cost-presets.test.js test/extension-default-preset-readiness.test.js test/extension-clear-default-cost-preset.test.js test/extension-watchlist.test.js`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add extension/sidepanel test/extension-view-model.test.js test/extension-cross-store-ui.test.js
git commit -m "feat: render cross-store price results"
```

---

### Task 9: Full Flow, Security Gate, Documentation, and Release Build

**Files:**
- Modify: `test/extension-release-security.test.js`
- Modify: `test/extension-integration.test.js`
- Modify: `README.md`
- Modify: `docs/BROWSER_EXTENSION.md`
- Modify: `HOW_TO_INSTALL_AUCTION_EXTENSION.md`
- Modify: release-packaging workflow/script used for `Auction-Browser-Extension-v1.0.0.zip`

**Interfaces:**
- End-to-end success path: `A -> Scan This Product -> ProductIdentity -> Cross-store search -> Match/rank -> Side-panel New/Refurbished/Used -> Buy link`.
- Release ZIP remains easy-install: `manifest.json` must be at the extracted folder root.

- [ ] **Step 1: Extend security tests before release changes**

Add assertions that the built extension:

```js
assert.deepEqual(manifest.permissions, ['sidePanel', 'storage', 'activeTab', 'scripting']);
assert.equal(JSON.stringify(manifest).includes('<all_urls>'), false);
assert.equal((await stat(path.join(outputDir, 'popup', 'index.html'))).isFile(), true);
```

Also scan built JS/HTML/JSON for provider-key names followed by non-empty literal secret values and preserve the existing bans on dynamic executable code, remote scripts, HTML injection sinks, and Node-only `process.env` inside the built extension.

- [ ] **Step 2: Add the full deterministic flow test**

The test harness must simulate: popup active tab 42, scan of a Dell product, one trusted provider, one failing provider, New/Refurbished/Used offers, a wrong-RAM rejected offer, an unknown-shipping offer, and a Guardian-flagged suspicious offer. Assert the final model identifies the cheapest item and confirmed total independently for each condition and preserves the provider failure as partial-results metadata.

- [ ] **Step 3: Run full suite before documentation edits**

Run: `npm test`

Expected: PASS with all prior tests plus the new scan/search tests.

- [ ] **Step 4: Update user documentation**

README and browser docs must state:

```text
Click the Auction A -> Scan This Product.
Auction scans only the active page after that explicit click.
Results are separated into New, Refurbished, and Used.
Cheapest Item Price and Cheapest Estimated Total are shown separately.
Unknown shipping is never treated as free shipping.
Live provider-backed cross-store results require approved backend data access; provider credentials are never stored in the extension.
```

Update install guidance to describe the toolbar popup and retain the easy-install folder rule: after extraction, select the folder that directly contains `manifest.json`.

- [ ] **Step 5: Build and inspect the release package**

Run:

```bash
npm test
npm run build:extension
```

Then verify the release archive is flat at its extraction root by asserting these entries exist at top level after extraction:

```text
manifest.json
service-worker.js
popup/
content/
sidepanel/
```

and that there is no extra `auction-extension/manifest.json` nesting inside the easy-install archive.

- [ ] **Step 6: Commit documentation/release verification**

```bash
git add test/extension-release-security.test.js test/extension-integration.test.js README.md docs/BROWSER_EXTENSION.md HOW_TO_INSTALL_AUCTION_EXTENSION.md .github scripts
git commit -m "docs: finalize Auction scan search release"
```

- [ ] **Step 7: Fresh completion verification**

Run exactly:

```bash
npm test
npm run build:extension
```

Completion requires both commands to exit 0, release-security tests to pass, and inspection of the generated/easy-install ZIP to confirm `manifest.json` is directly in the folder the user selects with **Load unpacked**.

---

## Self-Review Mapping

- Explicit toolbar scan and arbitrary-page permission boundary: Tasks 2, 4, 7.
- Product identification and low-confidence confirmation: Tasks 1, 2, 7, 8.
- Cross-store provider-neutral search and partial failure: Task 6.
- Exact vs similar/rejected matches and spec mismatches: Task 5.
- New/Refurbished/Used separation: Tasks 1, 5, 8.
- Cheapest item vs cheapest confirmed delivered total: Tasks 1, 5, 8.
- Guardian authority and suspicious-source handling: Tasks 5, 8, 9.
- Privacy/no raw HTML/no credentials: Tasks 2, 3, 6, 9.
- Side-panel states and Buy links: Task 8.
- Build, security, docs, easy-install ZIP verification: Task 9.

No task embeds a marketplace/provider credential in the extension. A production shopping/visual provider endpoint is an operational dependency behind `createShoppingBackendConnector`; if it is not configured, the completed browser code must show `provider_unavailable` rather than fabricate live cross-store prices.