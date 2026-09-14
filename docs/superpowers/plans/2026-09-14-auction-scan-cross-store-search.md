# Auction Scan This Product + Cross-Store Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an explicit Auction toolbar scan that identifies the product on the active webpage and shows safely matched cross-store offers grouped into New, Refurbished, and Used with independent cheapest-item and cheapest-confirmed-total rankings.

**Architecture:** Keep the extension permission-bounded and thin. The toolbar popup uses `activeTab` + `scripting` after a user click to collect a small product-evidence record from the active page; a provider-neutral identification layer turns that evidence into `ProductIdentity`, using a secure visual-recognition backend only when page evidence is weak; a provider-neutral shopping layer returns normalized offers; deterministic match, Guardian screening, and ranking code produces the result model rendered by the side panel. Existing Auction valuation, sold-evidence, Opportunity, watchlist, and Guardian behavior remains intact.

**Tech Stack:** JavaScript ES modules, Chrome/Edge Manifest V3, Chrome `activeTab`, `scripting`, Side Panel API, Node.js 20+, built-in `node:test`, existing Auction pipeline/security modules.

**Spec:** `docs/superpowers/specs/2026-09-14-auction-scan-cross-store-search-design.md`

## Global Constraints

- A scan starts only from an explicit click on **Scan This Product**.
- Do not add `<all_urls>`.
- Add only `activeTab` and `scripting` to the existing required extension permissions.
- Existing fixed content scripts for eBay, Amazon, Walmart, and Best Buy may continue automatic supported-page detection.
- Arbitrary-page scan data is limited to product-relevant structured fields, explicit identifiers/spec labels, page title, and one primary image reference.
- Never send or persist raw HTML, cookies, session tokens, checkout contents, payment/card data, private messages, full page text, or browser history.
- All extension messages remain JSON-serializable and under the existing 64 KiB message limit.
- New, Refurbished, Used, and Unknown remain separate conditions.
- Unknown shipping remains unknown and never counts as zero when selecting the cheapest confirmed delivered total.
- Exact-match status considers identifiers, brand/model, category, and material category-specific specs.
- Accessories, replacement parts, empty boxes, and materially different configurations cannot be promoted as exact matches.
- Guardian/search-safety review remains authoritative; a suspicious cheap offer cannot receive a recommended-cheapest badge.
- No provider credential is stored in the extension bundle or committed to GitHub.
- Credentialed visual-recognition and cross-store shopping access runs only behind a secure backend. Until a real approved backend endpoint is configured, production code returns `provider_unavailable` rather than fabricating live results.
- No purchasing or checkout automation.
- Every task follows TDD: failing test, minimal production change, passing test, commit.

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
    identify.js
    matcher.js
    offer-guardian.js
    ranker.js
    search.js
  connectors/
    product-search-backend.js

scripts/
  build-extension.mjs

test/
  helpers/
    product-search-fixtures.js
    active-scan-dom.js
    popup-harness.js
    worker-scan-harness.js
    sidepanel-search-harness.js
  product-search-contracts.test.js
  extension-active-scan.test.js
  product-identification.test.js
  product-search-backend.test.js
  extension-messaging.test.js
  extension-popup.test.js
  product-search-matcher.test.js
  product-search-guardian.test.js
  product-search-ranker.test.js
  product-search-orchestration.test.js
  extension-cross-store-integration.test.js
  extension-cross-store-ui.test.js
  extension-view-model.test.js
  extension-release-security.test.js
  extension-integration.test.js
```

`src/product-search/` owns product identity, provider-neutral identification, offer matching, offer safety, and ranking. `extension/content/active-scan.js` is a self-contained page function so Chrome can execute it with `chrome.scripting.executeScript({ func })` under `activeTab`. The popup owns the user gesture. The service worker orchestrates identification/search but does not parse DOM or duplicate matching rules. The side panel only renders the normalized search model.

---

### Task 1: Product Search Contracts and Shared Fixtures

**Files:**
- Create: `src/product-search/contracts.js`
- Create: `test/helpers/product-search-fixtures.js`
- Create: `test/product-search-contracts.test.js`

**Interfaces:**
- Produces `normalizeCondition(value)`.
- Produces `normalizeProductIdentity(input, context)`.
- Produces `normalizeScanEvidence(input, context)`.
- Produces `normalizeOffer(input)`.
- Produces shared deterministic `dellIdentity()`, `dellEvidence()`, and `dellOffer()` test factories.

- [ ] **Step 1: Create shared deterministic test fixtures**

Create `test/helpers/product-search-fixtures.js`:

```js
export function dellIdentity(overrides = {}) {
  return {
    title: 'Dell Latitude 7420',
    brand: 'Dell',
    model: 'Latitude 7420',
    category: 'Laptop',
    condition: 'used',
    identifiers: { mpn: 'LAT7420' },
    specs: { ram: '16GB', storage: '512GB SSD', screenSize: '14 inch' },
    sourceUrl: 'https://www.ebay.com/itm/123',
    imageUrl: 'https://images.example/dell-7420.jpg',
    confidence: 0.94,
    capturedAt: '2026-09-14T12:00:00.000Z',
    ...overrides
  };
}

export function dellEvidence(overrides = {}) {
  return {
    sourceUrl: 'https://www.google.com/search?q=dell+latitude+7420&tbm=isch',
    pageTitle: 'Dell Latitude 7420 - Google Images',
    title: 'Dell Latitude 7420',
    brand: 'Dell',
    model: 'Latitude 7420',
    category: 'Laptop',
    condition: null,
    identifiers: {},
    specs: { ram: '16GB', storage: '512GB SSD' },
    imageUrl: 'https://images.example/dell-7420.jpg',
    evidenceKinds: ['page_metadata', 'primary_image'],
    confidence: 0.62,
    capturedAt: '2026-09-14T12:00:00.000Z',
    ...overrides
  };
}

export function dellOffer(overrides = {}) {
  return {
    source: 'fixture-store',
    sourceId: 'offer-1',
    store: 'Fixture Store',
    title: 'Dell Latitude 7420 16GB 512GB SSD',
    url: 'https://shop.example/products/dell-7420',
    imageUrl: 'https://shop.example/images/dell-7420.jpg',
    brand: 'Dell',
    model: 'Latitude 7420',
    category: 'Laptop',
    identifiers: { mpn: 'LAT7420' },
    specs: { ram: '16GB', storage: '512GB SSD', screenSize: '14 inch' },
    condition: 'used',
    itemPrice: 220,
    shipping: 15,
    currency: 'USD',
    availability: 'in_stock',
    trustTier: 'trusted',
    sourceConfidence: 0.95,
    ...overrides
  };
}
```

- [ ] **Step 2: Write failing contract tests**

Create `test/product-search-contracts.test.js` with these assertions:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCondition, normalizeOffer, normalizeProductIdentity, normalizeScanEvidence } from '../src/product-search/contracts.js';
import { dellEvidence, dellIdentity, dellOffer } from './helpers/product-search-fixtures.js';

test('normalizes condition without guessing open-box condition', () => {
  assert.equal(normalizeCondition('Brand New'), 'new');
  assert.equal(normalizeCondition('Certified Refurbished'), 'refurbished');
  assert.equal(normalizeCondition('Pre-Owned'), 'used');
  assert.equal(normalizeCondition('Open Box'), 'unknown');
});

test('normalizes a bounded product identity', () => {
  const identity = normalizeProductIdentity(dellIdentity(), { now: new Date('2026-09-14T12:00:00Z') });
  assert.equal(identity.model, 'Latitude 7420');
  assert.equal(identity.identifiers.mpn, 'LAT7420');
  assert.equal(identity.specs.ram, '16GB');
  assert.equal(identity.confidence, 0.94);
});

test('normalizes scan evidence without arbitrary fields', () => {
  const evidence = normalizeScanEvidence({ ...dellEvidence(), rawHtml: '<form>secret</form>', cookie: 'session=secret' });
  assert.equal(evidence.model, 'Latitude 7420');
  assert.equal('rawHtml' in evidence, false);
  assert.equal('cookie' in evidence, false);
});

test('keeps unknown shipping unknown', () => {
  const offer = normalizeOffer(dellOffer({ shipping: null }));
  assert.equal(offer.shipping, null);
  assert.equal(offer.estimatedTotal, null);
});

test('computes total only when shipping is known', () => {
  const offer = normalizeOffer(dellOffer({ itemPrice: 220, shipping: 15 }));
  assert.equal(offer.estimatedTotal, 235);
});
```

- [ ] **Step 3: Run tests and verify RED**

Run: `node --test test/product-search-contracts.test.js`

Expected: FAIL because `src/product-search/contracts.js` does not exist.

- [ ] **Step 4: Implement the contracts**

Create `src/product-search/contracts.js`. Use these exact limits and normalizers:

```js
export const PRODUCT_CONDITIONS = Object.freeze(['new', 'refurbished', 'used', 'unknown']);
const MAX_IDENTIFIERS = 20;
const MAX_SPECS = 24;

function bounded(value, max, required = false) {
  const text = value == null ? '' : String(value).trim().replace(/\s+/g, ' ');
  if (required && !text) throw new TypeError('required string is missing');
  if (!text) return null;
  if (text.length > max) throw new RangeError('string exceeds maximum length');
  return text;
}

function httpsUrl(value, required = false) {
  if (value == null || value === '') {
    if (required) throw new TypeError('https URL is required');
    return null;
  }
  const url = new URL(String(value));
  if (url.protocol !== 'https:') throw new TypeError('URL must use https');
  url.hash = '';
  return url.toString();
}

function record(value, maxEntries) {
  if (value == null) return Object.freeze({});
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('record must be an object');
  const entries = Object.entries(value);
  if (entries.length > maxEntries) throw new RangeError('record has too many entries');
  return Object.freeze(Object.fromEntries(entries.map(([key, entry]) => [bounded(key, 64, true), bounded(entry, 256, true)])));
}

export function normalizeCondition(value) {
  const text = String(value ?? '').trim().toLowerCase();
  if (!text) return 'unknown';
  if (/refurb|renewed|remanufactured/.test(text)) return 'refurbished';
  if (/\bused\b|pre[- ]?owned|second[- ]?hand/.test(text)) return 'used';
  if (/\bnew\b/.test(text) && !/open[- ]?box/.test(text)) return 'new';
  return 'unknown';
}

function confidence(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1) throw new TypeError('confidence must be between 0 and 1');
  return number;
}

export function normalizeProductIdentity(input = {}, context = {}) {
  return Object.freeze({
    title: bounded(input.title, 512, true),
    brand: bounded(input.brand, 128),
    model: bounded(input.model, 128),
    category: bounded(input.category, 256),
    condition: normalizeCondition(input.condition),
    identifiers: record(input.identifiers, MAX_IDENTIFIERS),
    specs: record(input.specs, MAX_SPECS),
    sourceUrl: httpsUrl(input.sourceUrl, true),
    imageUrl: httpsUrl(input.imageUrl),
    confidence: confidence(input.confidence),
    capturedAt: new Date(context.now ?? input.capturedAt ?? Date.now()).toISOString()
  });
}

export function normalizeScanEvidence(input = {}, context = {}) {
  const kinds = Array.isArray(input.evidenceKinds) ? input.evidenceKinds.slice(0, 8).map(value => bounded(value, 64, true)) : [];
  return Object.freeze({
    sourceUrl: httpsUrl(input.sourceUrl, true),
    pageTitle: bounded(input.pageTitle, 512),
    title: bounded(input.title, 512),
    brand: bounded(input.brand, 128),
    model: bounded(input.model, 128),
    category: bounded(input.category, 256),
    condition: input.condition == null ? null : normalizeCondition(input.condition),
    identifiers: record(input.identifiers, MAX_IDENTIFIERS),
    specs: record(input.specs, MAX_SPECS),
    imageUrl: httpsUrl(input.imageUrl),
    evidenceKinds: Object.freeze(kinds),
    confidence: confidence(input.confidence ?? 0),
    capturedAt: new Date(context.now ?? input.capturedAt ?? Date.now()).toISOString()
  });
}

export function normalizeOffer(input = {}) {
  const itemPrice = Number(input.itemPrice);
  if (!Number.isFinite(itemPrice) || itemPrice <= 0) throw new TypeError('itemPrice must be positive');
  const shipping = input.shipping == null ? null : Number(input.shipping);
  if (shipping !== null && (!Number.isFinite(shipping) || shipping < 0)) throw new TypeError('shipping must be non-negative');
  const currency = bounded(input.currency, 3, true).toUpperCase();
  if (currency !== 'USD') throw new TypeError('only USD is supported');
  const source = bounded(input.source, 64, true);
  const sourceId = bounded(input.sourceId, 256, true);
  return Object.freeze({
    offerId: `${source}:${sourceId}`,
    source,
    sourceId,
    store: bounded(input.store, 128, true),
    title: bounded(input.title, 512, true),
    url: httpsUrl(input.url, true),
    imageUrl: httpsUrl(input.imageUrl),
    brand: bounded(input.brand, 128),
    model: bounded(input.model, 128),
    category: bounded(input.category, 256),
    identifiers: record(input.identifiers, MAX_IDENTIFIERS),
    specs: record(input.specs, MAX_SPECS),
    condition: normalizeCondition(input.condition),
    itemPrice,
    shipping,
    estimatedTotal: shipping === null ? null : Math.round((itemPrice + shipping) * 100) / 100,
    currency,
    availability: bounded(input.availability, 64),
    trustTier: input.trustTier === 'trusted' ? 'trusted' : 'broad',
    sourceConfidence: confidence(input.sourceConfidence ?? 0)
  });
}
```

- [ ] **Step 5: Run tests and verify GREEN**

Run: `node --test test/product-search-contracts.test.js`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/product-search/contracts.js test/helpers/product-search-fixtures.js test/product-search-contracts.test.js
git commit -m "feat: add product search contracts"
```

---

### Task 2: One-Shot Active-Page Evidence Scanner

**Files:**
- Create: `extension/content/active-scan.js`
- Create: `test/helpers/active-scan-dom.js`
- Create: `test/extension-active-scan.test.js`

**Interfaces:**
- Consumes no extension state and no secrets.
- Produces `collectActiveProductEvidence(options = {}) -> ScanEvidence-compatible plain object`.
- The exported function must be self-contained: helper functions are declared inside it so Chrome can serialize the function into `scripting.executeScript({ func: collectActiveProductEvidence })`.

- [ ] **Step 1: Create the deterministic fake-DOM helper**

`test/helpers/active-scan-dom.js` exports `fakeScanDocument({ title, selectors, jsonLd })`. Its object exposes only `title`, `querySelector`, and `querySelectorAll`; node objects expose only `textContent` and `getAttribute`. No DOM package is added.

- [ ] **Step 2: Write failing scanner tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { collectActiveProductEvidence } from '../extension/content/active-scan.js';
import { fakeScanDocument } from './helpers/active-scan-dom.js';

test('prefers Product JSON-LD on a product page', () => {
  const documentLike = fakeScanDocument({
    title: 'Dell Latitude 7420',
    jsonLd: [{ '@type': 'Product', name: 'Dell Latitude 7420', brand: { name: 'Dell' }, model: 'Latitude 7420', sku: 'LAT7420', image: 'https://images.example/dell.jpg' }]
  });
  const result = collectActiveProductEvidence({ documentLike, locationLike: { href: 'https://shop.example/dell' }, now: '2026-09-14T12:00:00Z' });
  assert.equal(result.model, 'Latitude 7420');
  assert.ok(result.evidenceKinds.includes('structured_product'));
});

test('captures image and bounded title from an image-results page', () => {
  const documentLike = fakeScanDocument({
    title: 'Dell Latitude 7420 - Images',
    selectors: { 'meta[property="og:image"]': { content: 'https://images.example/dell.jpg' } }
  });
  const result = collectActiveProductEvidence({ documentLike, locationLike: { href: 'https://www.google.com/search?q=dell+7420&tbm=isch' }, now: '2026-09-14T12:00:00Z' });
  assert.equal(result.imageUrl, 'https://images.example/dell.jpg');
  assert.ok(result.confidence > 0);
});

test('does not read arbitrary body, forms, cookies, or payment fields', () => {
  const documentLike = fakeScanDocument({ title: 'Product page 4111111111111111' });
  documentLike.body = { innerText: 'PRIVATE MESSAGE session=secret' };
  documentLike.cookie = 'session=secret';
  const result = collectActiveProductEvidence({ documentLike, locationLike: { href: 'https://shop.example/item' }, now: '2026-09-14T12:00:00Z' });
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes('PRIVATE MESSAGE'), false);
  assert.equal(serialized.includes('session=secret'), false);
  assert.equal('rawHtml' in result, false);
});
```

- [ ] **Step 3: Run the test and verify RED**

Run: `node --test test/extension-active-scan.test.js`

Expected: FAIL because `active-scan.js` does not exist.

- [ ] **Step 4: Implement the self-contained collector**

Inside `collectActiveProductEvidence`, declare local helpers for bounded text, HTTPS image URL, JSON-LD traversal, brand/model/identifier extraction, and confidence scoring. Read only these selectors:

```js
const META_SELECTORS = Object.freeze([
  'meta[property="og:title"]',
  'meta[property="og:image"]',
  'meta[name="twitter:title"]',
  'meta[name="twitter:image"]',
  'meta[itemprop="model"]',
  'meta[itemprop="sku"]',
  'meta[itemprop="mpn"]',
  'meta[itemprop="gtin"]'
]);
```

Read `script[type="application/ld+json"]` only to find `@type: Product`; copy only `name`, `brand`, `model`, `category`, `sku`, `mpn`, GTIN fields, `itemCondition`, and the first image URL. Confidence weights are deterministic: structured product `0.70`, explicit model/identifier `+0.20`, primary image `+0.10`, page metadata alone `0.35`; clamp to `1.0`. Return a plain object with only the Task 1 ScanEvidence fields.

- [ ] **Step 5: Run scanner and existing adapter regressions**

Run: `node --test test/extension-active-scan.test.js test/extension-adapters.test.js test/extension-scanner.test.js`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add extension/content/active-scan.js test/helpers/active-scan-dom.js test/extension-active-scan.test.js
git commit -m "feat: add explicit active page scan"
```

---

### Task 3: Product Identification and Visual Fallback Boundary

**Files:**
- Create: `src/product-search/identify.js`
- Create: `src/connectors/product-search-backend.js`
- Create: `test/product-identification.test.js`
- Create: `test/product-search-backend.test.js`

**Interfaces:**
- Produces `identifyProduct(evidence, { visualProvider }) -> { status, identity }`.
- `visualProvider` contract: `{ name, identifyProduct(evidence) }`.
- Produces browser-safe `createProductSearchBackend({ endpoint, fetchImpl, timeoutMs })` with methods `identifyProduct(evidence)` and `searchOffers(identity)`.
- This connector must not import Node-only modules such as `node:net` or read `process.env`.

- [ ] **Step 1: Write failing identification tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { identifyProduct } from '../src/product-search/identify.js';
import { dellEvidence } from './helpers/product-search-fixtures.js';

test('accepts strong page evidence without calling visual provider', async () => {
  let calls = 0;
  const result = await identifyProduct(dellEvidence({ confidence: 0.91, identifiers: { mpn: 'LAT7420' } }), {
    visualProvider: { name: 'visual', async identifyProduct() { calls += 1; return {}; } }
  });
  assert.equal(result.status, 'identified');
  assert.equal(calls, 0);
});

test('uses visual provider only when page evidence is weak and an image exists', async () => {
  const result = await identifyProduct(dellEvidence({ confidence: 0.42, model: null, identifiers: {} }), {
    visualProvider: {
      name: 'visual',
      async identifyProduct() {
        return { title: 'Dell Latitude 7420', brand: 'Dell', model: 'Latitude 7420', category: 'Laptop', condition: 'used', identifiers: { mpn: 'LAT7420' }, specs: { ram: '16GB', storage: '512GB SSD' }, confidence: 0.88 };
      }
    }
  });
  assert.equal(result.status, 'identified');
  assert.equal(result.identity.model, 'Latitude 7420');
});

test('weak evidence without a configured visual provider requires confirmation', async () => {
  const result = await identifyProduct(dellEvidence({ confidence: 0.42, model: null, identifiers: {} }));
  assert.equal(result.status, 'needs_confirmation');
});
```

- [ ] **Step 2: Write failing backend-boundary tests**

```js
import { createProductSearchBackend } from '../src/connectors/product-search-backend.js';

test('backend sends only bounded evidence to visual identification endpoint', async () => {
  let posted;
  const backend = createProductSearchBackend({
    endpoint: 'https://backend.example/api/auction',
    fetchImpl: async (_url, options) => {
      posted = JSON.parse(options.body);
      return { ok: true, json: async () => ({ status: 'identified', identity: { title: 'Dell Latitude 7420', brand: 'Dell', model: 'Latitude 7420', category: 'Laptop', condition: 'used', identifiers: { mpn: 'LAT7420' }, specs: {}, sourceUrl: 'https://shop.example/item', imageUrl: 'https://images.example/dell.jpg', confidence: 0.9 } }) };
    }
  });
  await backend.identifyProduct(dellEvidence());
  assert.equal(posted.action, 'identify_product');
  assert.equal('rawHtml' in posted.evidence, false);
});
```

- [ ] **Step 3: Run tests and verify RED**

Run: `node --test test/product-identification.test.js test/product-search-backend.test.js`

Expected: FAIL because both modules are missing.

- [ ] **Step 4: Implement identification policy**

`identifyProduct` first calls `normalizeScanEvidence`. If evidence confidence is `>= 0.75` and at least one of `model` or identifiers is present, create `ProductIdentity` directly. Otherwise, when `imageUrl` exists and `visualProvider.identifyProduct` exists, call the provider and merge only its allowlisted normalized fields with original `sourceUrl`/`imageUrl`. A provider identity with confidence `< 0.75` returns `needs_confirmation`. Provider exceptions are swallowed into `needs_confirmation`; error text is never returned to the UI.

- [ ] **Step 5: Implement the browser-safe backend client**

Use only `URL`, `fetch`, `AbortController`, and Task 1 normalizers. Require an HTTPS endpoint. POST JSON with `redirect: 'error'`, `content-type: application/json`, and a timeout capped at 30 seconds. `/api/auction` receives an `action` field: `identify_product` or `search_offers`. The connector contains no token/API-key field; authentication to downstream providers is a backend responsibility.

- [ ] **Step 6: Run tests and verify GREEN**

Run: `node --test test/product-identification.test.js test/product-search-backend.test.js`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/product-search/identify.js src/connectors/product-search-backend.js test/product-identification.test.js test/product-search-backend.test.js
git commit -m "feat: add product identification fallback"
```

---

### Task 4: Extension Message Contracts for Scan and Search

**Files:**
- Modify: `extension/messaging/messages.js`
- Modify: `test/extension-messaging.test.js`

**Interfaces:**
Add these exact keys:

```js
SCAN_ACTIVE_PRODUCT_REQUEST: 'AUCTION_SCAN_ACTIVE_PRODUCT_REQUEST',
SCAN_ACTIVE_PRODUCT_RESULT: 'AUCTION_SCAN_ACTIVE_PRODUCT_RESULT',
CROSS_STORE_SEARCH_REQUEST: 'AUCTION_CROSS_STORE_SEARCH_REQUEST',
CROSS_STORE_SEARCH_RESULT: 'AUCTION_CROSS_STORE_SEARCH_RESULT'
```

`SCAN_ACTIVE_PRODUCT_REQUEST` payload is `{ tabId, evidence }`. `SCAN_ACTIVE_PRODUCT_RESULT` is `{ status, identity }`. `CROSS_STORE_SEARCH_REQUEST` is `{ identity }`. `CROSS_STORE_SEARCH_RESULT` is `{ status, identity, offers, groups, providerErrors }`.

- [ ] **Step 1: Add failing message tests**

Import `dellEvidence`, `dellIdentity`, and `dellOffer` from the shared fixture file. Assert that extra fields such as `rawHtml` are stripped, tab IDs are positive integers, only the defined status strings are allowed, provider errors contain only bounded `{ source, code }`, offer arrays are capped at 60, and messages over 64 KiB still fail.

- [ ] **Step 2: Run and verify RED**

Run: `node --test test/extension-messaging.test.js`

Expected: FAIL because the new message types are unsupported.

- [ ] **Step 3: Implement normalizers in `messages.js`**

Keep the existing analysis message behavior unchanged. Import Task 1 normalizers. Add explicit status sets:

```js
const SCAN_STATUSES = new Set(['identified', 'needs_confirmation', 'unidentified']);
const SEARCH_STATUSES = new Set(['complete', 'partial_results', 'no_exact_match', 'provider_unavailable']);
```

Normalize every identity/evidence/offer and reconstruct payload objects from allowlisted fields before rechecking the 64 KiB size limit.

- [ ] **Step 4: Run messaging and existing integration tests**

Run: `node --test test/extension-messaging.test.js test/extension-integration.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add extension/messaging/messages.js test/extension-messaging.test.js
git commit -m "feat: add scan search message contracts"
```

---

### Task 5: Toolbar Popup, `activeTab`, and `scripting`

**Files:**
- Create: `extension/popup/index.html`
- Create: `extension/popup/app.js`
- Create: `extension/popup/styles.css`
- Create: `test/helpers/popup-harness.js`
- Create: `test/extension-popup.test.js`
- Modify: `extension/manifest.json`
- Modify: `scripts/build-extension.mjs`
- Modify: `test/extension-integration.test.js`
- Modify: `test/extension-release-security.test.js`

**Interfaces:**
- Produces `createPopupApp({ documentLike, tabs, scripting, runtime, sidePanel })`.
- Popup imports Task 2 `collectActiveProductEvidence` and passes that self-contained function to `scripting.executeScript`.

- [ ] **Step 1: Build the popup harness**

`test/helpers/popup-harness.js` returns a fake document with button listeners plus fakes for `tabs.query`, `scripting.executeScript`, `runtime.sendMessage`, and `sidePanel.open`. The harness exposes `click(id)`, `sentMessages`, `scriptCalls`, and `openedPanels` so tests do not depend on a real browser.

- [ ] **Step 2: Write failing popup/manifest tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createPopupApp } from '../extension/popup/app.js';
import { popupHarness } from './helpers/popup-harness.js';

test('manifest adds explicit scan permissions without all_urls', async () => {
  const manifest = JSON.parse(await readFile(new URL('../extension/manifest.json', import.meta.url), 'utf8'));
  assert.deepEqual(manifest.permissions, ['sidePanel', 'storage', 'activeTab', 'scripting']);
  assert.equal(manifest.action.default_popup, 'popup/index.html');
  assert.equal(JSON.stringify(manifest).includes('<all_urls>'), false);
});

test('Scan This Product scans only the active tab and opens its side panel', async () => {
  const harness = popupHarness({ tabId: 42 });
  const app = createPopupApp(harness.dependencies);
  await harness.click('scan-product');
  assert.equal(harness.scriptCalls[0].target.tabId, 42);
  assert.deepEqual(harness.openedPanels, [{ tabId: 42 }]);
  assert.equal(harness.sentMessages[0].payload.tabId, 42);
  app.destroy();
});
```

- [ ] **Step 3: Run and verify RED**

Run: `node --test test/extension-popup.test.js test/extension-integration.test.js test/extension-release-security.test.js`

Expected: FAIL because popup/action/permissions do not exist.

- [ ] **Step 4: Implement popup files and manifest change**

`extension/popup/index.html` contains:

```html
<main class="popup-shell">
  <button id="scan-product" type="button" class="primary-action">Scan This Product</button>
  <button id="open-sidebar" type="button" class="secondary-action">Open Auction Sidebar</button>
  <p id="popup-status" aria-live="polite"></p>
</main>
<script type="module" src="./app.js"></script>
```

On scan click: query `{ active: true, currentWindow: true }`; require a numeric tab ID and an HTTP(S) tab; open the side panel while the user gesture is active; run `scripting.executeScript({ target: { tabId }, func: collectActiveProductEvidence })`; validate the returned evidence by creating `SCAN_ACTIVE_PRODUCT_REQUEST`; send it to the service worker. Restricted pages show `Auction cannot scan this browser page.` and no search request.

Add `"action": { "default_popup": "popup/index.html" }` and append `activeTab`, `scripting` to permissions. Do not change the four fixed `host_permissions` or add `<all_urls>`.

- [ ] **Step 5: Add `popup` to the build copy list**

Update `COPY_DIRECTORIES` in `scripts/build-extension.mjs` from five directories to six by including `'popup'`.

- [ ] **Step 6: Run popup/security/build tests**

Run: `node --test test/extension-popup.test.js test/extension-integration.test.js test/extension-release-security.test.js && npm run build:extension`

Expected: PASS and `dist/auction-extension/popup/index.html` exists.

- [ ] **Step 7: Commit**

```bash
git add extension/popup extension/manifest.json scripts/build-extension.mjs test/helpers/popup-harness.js test/extension-popup.test.js test/extension-integration.test.js test/extension-release-security.test.js
git commit -m "feat: add Auction scan toolbar popup"
```

---

### Task 6: Exact Matching, Search Guardian, and Condition-Aware Ranking

**Files:**
- Create: `src/product-search/matcher.js`
- Create: `src/product-search/offer-guardian.js`
- Create: `src/product-search/ranker.js`
- Create: `test/product-search-matcher.test.js`
- Create: `test/product-search-guardian.test.js`
- Create: `test/product-search-ranker.test.js`

**Interfaces:**
- Produces `matchOffer(identity, offer) -> { classification, score, reasons }` where classification is `exact`, `similar`, or `rejected`.
- Produces `screenMatchedOffers(matchedOffers) -> matched offers with guardianDecision`.
- Produces `rankOffers(identity, offers) -> { offers, groups }` where each condition group has `offerIds`, `cheapestItemId`, `cheapestTotalId`, and `bestExactId`.

- [ ] **Step 1: Write failing matcher tests**

Use `dellIdentity()` and `dellOffer()` from the shared fixtures. Assert:
- exact MPN + model + specs => `exact`;
- wrong 8GB/256GB configuration => `rejected`;
- `replacement keyboard`, `charger`, `empty box`, or `for parts accessory` title => `rejected`;
- missing one non-conflicting spec can be `similar`, never silently upgraded to exact.

- [ ] **Step 2: Write failing Guardian tests**

Create three same-condition exact offers. Assert a broad-source offer with `sourceConfidence < 0.75` is `review`, a trusted exact normal-price offer is `allow`, and an otherwise exact offer priced below 25% of the median peer item price is `review`. A `rejected` match receives `reject`.

- [ ] **Step 3: Write failing ranker tests**

```js
test('keeps conditions separate and ranks item and delivered prices independently', () => {
  const result = rankOffers(dellIdentity(), [
    dellOffer({ sourceId: 'new-1', condition: 'new', itemPrice: 400, shipping: 0 }),
    dellOffer({ sourceId: 'used-1', condition: 'used', itemPrice: 200, shipping: 25 }),
    dellOffer({ sourceId: 'used-2', condition: 'used', itemPrice: 210, shipping: 0 })
  ]);
  assert.equal(result.groups.new.cheapestItemId, 'fixture-store:new-1');
  assert.equal(result.groups.used.cheapestItemId, 'fixture-store:used-1');
  assert.equal(result.groups.used.cheapestTotalId, 'fixture-store:used-2');
});

test('unknown shipping cannot win confirmed total ranking', () => {
  const result = rankOffers(dellIdentity(), [
    dellOffer({ sourceId: 'unknown-shipping', itemPrice: 180, shipping: null }),
    dellOffer({ sourceId: 'confirmed', itemPrice: 190, shipping: 5 })
  ]);
  assert.equal(result.groups.used.cheapestTotalId, 'fixture-store:confirmed');
});
```

- [ ] **Step 4: Run and verify RED**

Run: `node --test test/product-search-matcher.test.js test/product-search-guardian.test.js test/product-search-ranker.test.js`

Expected: FAIL because the modules are missing.

- [ ] **Step 5: Implement matching**

Identifier conflicts reject. Exact brand/model is required when no shared strong identifier exists. Normalize spec values to lowercase alphanumeric tokens. For laptops compare RAM, storage, screen size, CPU, GPU when both sides supply them; for phones compare storage and carrier/unlocked state; for TVs compare model and size. Missing values reduce score; conflicting material values reject. Accessory keywords are rejected before scoring.

- [ ] **Step 6: Implement offer Guardian**

Guardian receives already matched normalized offers, calculates same-condition exact-peer median item price, and sets only `allow`, `review`, or `reject`. It never changes price, condition, or match classification. `review`/`reject` offers stay visible for explainability but are excluded from recommended cheapest/best IDs.

- [ ] **Step 7: Implement ranking**

For each of `new`, `refurbished`, `used`, `unknown`, sort visible offers by match classification, match score, trust tier, source confidence, then price. `cheapestItemId` selects the lowest item price among `guardianDecision === 'allow'` exact offers. `cheapestTotalId` selects the lowest non-null confirmed total among the same safe exact set. `bestExactId` uses match/trust/confidence tie-breaks before price.

- [ ] **Step 8: Run focused tests**

Run: `node --test test/product-search-matcher.test.js test/product-search-guardian.test.js test/product-search-ranker.test.js`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/product-search/matcher.js src/product-search/offer-guardian.js src/product-search/ranker.js test/product-search-matcher.test.js test/product-search-guardian.test.js test/product-search-ranker.test.js
git commit -m "feat: add safe cross-store matching and ranking"
```

---

### Task 7: Provider-Neutral Cross-Store Search Orchestration

**Files:**
- Create: `src/product-search/search.js`
- Create: `test/product-search-orchestration.test.js`
- Extend: `test/product-search-backend.test.js`

**Interfaces:**
- Provider contract: `{ name, trustTier, searchOffers(identity, options) }`.
- Produces `searchAcrossStores(identity, { providers, timeoutMs }) -> { offers, providerErrors }`.
- Reuses `createProductSearchBackend(...).searchOffers(identity)` as a credential-safe provider.

- [ ] **Step 1: Write failing orchestrator tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { searchAcrossStores } from '../src/product-search/search.js';
import { dellIdentity, dellOffer } from './helpers/product-search-fixtures.js';

test('keeps successful stores when one provider fails', async () => {
  const result = await searchAcrossStores(dellIdentity(), {
    providers: [
      { name: 'trusted-a', trustTier: 'trusted', async searchOffers() { return [dellOffer({ source: 'trusted-a', sourceId: '1' })]; } },
      { name: 'broken', trustTier: 'broad', async searchOffers() { throw new Error('token=secret'); } }
    ]
  });
  assert.equal(result.offers.length, 1);
  assert.deepEqual(result.providerErrors, [{ source: 'broken', code: 'provider_unavailable' }]);
  assert.equal(JSON.stringify(result).includes('token=secret'), false);
});
```

Also test deduplication by `offerId`, 30-offer per-provider cap, 60 total cap, malformed provider output isolation, and zero configured providers => `{ offers: [], providerErrors: [{ source: 'shopping', code: 'provider_unavailable' }] }`.

- [ ] **Step 2: Extend backend tests for `search_offers`**

Assert the backend receives `{ action: 'search_offers', identity }`, returns only normalized offers, and rejects non-HTTPS endpoints, redirects, malformed responses, or timeout with a safe exception that exposes no response body/token.

- [ ] **Step 3: Run and verify RED**

Run: `node --test test/product-search-orchestration.test.js test/product-search-backend.test.js`

Expected: FAIL because `search.js` is missing and `search_offers` is not implemented.

- [ ] **Step 4: Implement provider isolation**

Use `Promise.allSettled` over providers. For each fulfilled provider, normalize at most 30 offers and stamp its declared trust tier rather than trusting a remote `trustTier` field. Convert every rejected provider to `{ source: provider.name, code: 'provider_unavailable' }`. Deduplicate normalized offers by `offerId` first and canonical HTTPS URL second. Return no exception text.

- [ ] **Step 5: Implement backend shopping action**

Extend Task 3 backend client with `searchOffers(identity)` posting the normalized identity. The browser bundle still contains no downstream provider token. A production endpoint is injected/configured only after its exact origin is approved for the extension release.

- [ ] **Step 6: Run focused tests**

Run: `node --test test/product-search-orchestration.test.js test/product-search-backend.test.js`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/product-search/search.js src/connectors/product-search-backend.js test/product-search-orchestration.test.js test/product-search-backend.test.js
git commit -m "feat: add cross-store provider orchestration"
```

---

### Task 8: Service Worker Scan -> Identify -> Search -> Rank Flow

**Files:**
- Create: `test/helpers/worker-scan-harness.js`
- Create: `test/extension-cross-store-integration.test.js`
- Modify: `extension/service-worker.js`
- Modify: `test/extension-integration.test.js`

**Interfaces:**
- `createAuctionServiceWorker` keeps existing analysis behavior and gains injectable `identifyProductImpl`, `searchAcrossStoresImpl`, `rankOffersImpl`, and `publish` dependencies.
- `SCAN_ACTIVE_PRODUCT_REQUEST` triggers identification and, when identified, cross-store search/ranking.
- `CROSS_STORE_SEARCH_REQUEST` supports an already-confirmed identity.

- [ ] **Step 1: Create deterministic worker harness**

`test/helpers/worker-scan-harness.js` supplies an `onMessage` runtime identical to the existing integration harness plus `dispatch(message)` and a `published` array. `publish(message)` appends to `published`. This keeps worker tests independent of Chrome.

- [ ] **Step 2: Write failing worker-flow tests**

Use the shared Dell fixtures. Assert:
- strong scan evidence publishes `SCAN_ACTIVE_PRODUCT_RESULT` with `identified`;
- worker then searches providers and publishes `CROSS_STORE_SEARCH_RESULT`;
- one provider failure produces `partial_results` while successful offers remain;
- `needs_confirmation` stops before shopping search;
- no configured shopping provider produces `provider_unavailable` without breaking `ANALYSIS_REQUEST` handling;
- existing Guardian/manual-review analysis responses remain unchanged.

- [ ] **Step 3: Run and verify RED**

Run: `node --test test/extension-cross-store-integration.test.js test/extension-integration.test.js`

Expected: FAIL because the worker handles analysis only.

- [ ] **Step 4: Refactor worker routing without changing old analysis semantics**

Keep `createAuctionAnalysisHandler` as-is except for unrelated source-hardcoding only if an existing regression requires it. Add a validated message router:

```text
ANALYSIS_REQUEST -> existing createAuctionClient path
SCAN_ACTIVE_PRODUCT_REQUEST -> identify -> publish scan state -> search -> rank -> publish result
CROSS_STORE_SEARCH_REQUEST -> search -> rank -> publish result
anything else -> safe unsupported response
```

`publish` defaults to `message => globalThis.chrome?.runtime?.sendMessage?.(message)`. Catch publish failures because the side panel may have closed. Provider/identifier exceptions become safe statuses, never raw exception messages.

- [ ] **Step 5: Run integration/messaging regressions**

Run: `node --test test/extension-cross-store-integration.test.js test/extension-integration.test.js test/extension-messaging.test.js`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add extension/service-worker.js test/helpers/worker-scan-harness.js test/extension-cross-store-integration.test.js test/extension-integration.test.js
git commit -m "feat: orchestrate Auction product scan search"
```

---

### Task 9: Side Panel States and New / Refurbished / Used Results

**Files:**
- Create: `test/helpers/sidepanel-search-harness.js`
- Create: `test/extension-cross-store-ui.test.js`
- Modify: `extension/sidepanel/index.html`
- Modify: `extension/sidepanel/app.js`
- Modify: `extension/sidepanel/view-model.js`
- Modify: `extension/sidepanel/styles.css`
- Modify: `test/extension-view-model.test.js`

**Interfaces:**
- Produces `buildSearchViewModel(identity, result)` while keeping `buildAnalysisViewModel` unchanged.
- Supports UI states `ready-to-scan`, `scanning-page`, `identifying-product`, `needs-confirmation`, `searching-stores`, `partial-results`, `complete-results`, `no-exact-match`, `provider-unavailable`, `safe-error`.

- [ ] **Step 1: Create side-panel harness**

`test/helpers/sidepanel-search-harness.js` extends the project’s existing fake-document pattern: elements support `textContent`, `hidden`, `disabled`, `href`, `replaceChildren`, `appendChild`, and event listeners. It exposes `emit(message)` through a fake `runtime.onMessage` listener and methods to inspect rendered offer links/condition sections.

- [ ] **Step 2: Add failing view-model tests**

Build a result from Task 6 ranker output. Assert section labels are exactly `New`, `Refurbished`, `Used`, and optional `Unknown`; item and total badges point to different offers when appropriate; `Shipping unknown` remains visible; flagged Guardian offers have no recommended badge.

- [ ] **Step 3: Add failing UI tests**

```js
test('renders separate condition sections and safe Buy links', async () => {
  const harness = sidePanelSearchHarness();
  const app = createSidePanelApp(harness.dependencies);
  await harness.emit(crossStoreResultFixture());
  assert.equal(harness.sectionVisible('used'), true);
  assert.ok(harness.offerLinks().every(link => link.href.startsWith('https://')));
  app.destroy();
});
```

`crossStoreResultFixture()` is defined in `sidepanel-search-harness.js` by composing the shared Dell fixtures with fixed group IDs; it is not an undeclared helper.

- [ ] **Step 4: Run and verify RED**

Run: `node --test test/extension-view-model.test.js test/extension-cross-store-ui.test.js`

Expected: FAIL because search rendering is absent.

- [ ] **Step 5: Implement the view-model**

Create a map from `offerId` to offer, then dereference each group’s `offerIds`, `cheapestItemId`, `cheapestTotalId`, and `bestExactId`. Format money using the existing formatter boundary or a shared internal helper; do not recalculate rankings. For each offer expose `store`, `title`, `itemPriceLabel`, `shippingLabel`, `totalLabel`, `condition`, `matchLabel`, `guardianDecision`, `url`, and boolean badges `isCheapestItem`, `isCheapestTotal`, `isBestExact`.

- [ ] **Step 6: Implement side-panel DOM and states**

Add a search-results section before the existing cost/valuation area. Render condition navigation/buttons and result cards using `createElement` + `textContent`; do not use `innerHTML`. External Buy links use the already-normalized HTTPS URL and `target="_blank"` with `rel="noopener noreferrer"`. Existing costs, presets, watchlist, and analysis UI remain usable.

- [ ] **Step 7: Run UI and regression tests**

Run: `node --test test/extension-view-model.test.js test/extension-cross-store-ui.test.js test/extension-cost-presets.test.js test/extension-default-preset-readiness.test.js test/extension-clear-default-cost-preset.test.js test/extension-watchlist.test.js`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add extension/sidepanel test/helpers/sidepanel-search-harness.js test/extension-cross-store-ui.test.js test/extension-view-model.test.js
git commit -m "feat: render cross-store Auction results"
```

---

### Task 10: Full Security Gate, Documentation, Easy-Install ZIP, and Completion Verification

**Files:**
- Modify: `test/extension-release-security.test.js`
- Modify: `test/extension-integration.test.js`
- Modify: `README.md`
- Modify: `docs/BROWSER_EXTENSION.md`
- Modify: `HOW_TO_INSTALL_AUCTION_EXTENSION.md`
- Modify: existing release-packaging workflow/script that publishes `Auction-Browser-Extension-v1.0.0.zip`

**Interfaces:**
- Final deterministic flow: `A -> Scan This Product -> activeTab evidence -> identify -> visual fallback when needed -> cross-store providers -> match -> Guardian screen -> condition ranking -> side-panel result -> Buy link`.
- Final easy-install archive extracts so the folder the user selects contains `manifest.json` directly.

- [ ] **Step 1: Extend release-security assertions**

Update the manifest permission assertion to:

```js
assert.deepEqual(manifest.permissions, ['sidePanel', 'storage', 'activeTab', 'scripting']);
assert.equal(JSON.stringify(manifest).includes('<all_urls>'), false);
assert.equal((await stat(path.join(outputDir, 'popup', 'index.html'))).isFile(), true);
```

Preserve all existing bans on `eval`, `new Function`, HTML injection sinks, remote scripts/imports, Node-only `process.env`, and credential-like material. Add a check that built files contain no non-empty literals named `API_KEY`, `ACCESS_TOKEN`, `CLIENT_SECRET`, `SERPAPI_KEY`, `GOOGLE_API_KEY`, or `EBAY_ACCESS_TOKEN`.

- [ ] **Step 2: Add one full deterministic flow test**

In `test/extension-integration.test.js`, simulate: active tab 42; Dell evidence; visual fallback for a low-confidence image page; trusted New/Refurbished/Used offers; one broad-store provider failure; a wrong-RAM offer; an unknown-shipping offer; and a suspicious implausibly cheap offer. Assert final result:
- contains all three main conditions separately;
- rejects wrong RAM from exact offers;
- chooses cheapest item and cheapest confirmed total independently;
- does not let unknown shipping win confirmed-total ranking;
- does not badge the Guardian-reviewed suspicious offer as recommended;
- records the failed provider as partial results;
- exposes only HTTPS Buy URLs.

- [ ] **Step 3: Run the entire test suite before docs/release edits**

Run: `npm test`

Expected: PASS.

- [ ] **Step 4: Update user documentation**

README/browser/install docs must say exactly what a user does:

```text
1. Click the Auction A in the browser toolbar.
2. Choose Scan This Product.
3. Auction scans product-relevant data only from the active page for that explicit request.
4. Cross-store results appear in New, Refurbished, and Used sections.
5. Cheapest Item Price and Cheapest Estimated Total are separate rankings.
6. Shipping unknown is never treated as free shipping.
7. Buy opens the merchant offer; Auction does not purchase automatically.
```

Document that live visual/cross-store providers require an approved secure backend endpoint. Do not claim live worldwide search is configured until that endpoint is actually configured and verified.

- [ ] **Step 5: Change release packaging to a flat easy-install ZIP**

The ZIP command must run from inside `dist/auction-extension` so archive entries begin with `manifest.json`, `service-worker.js`, `popup/`, `content/`, and `sidepanel/`, not `auction-extension/manifest.json`. Keep the public filename `Auction-Browser-Extension-v1.0.0.zip` so the README link remains stable unless a version bump is separately approved.

- [ ] **Step 6: Add archive-structure verification to the release job**

After creating the ZIP, inspect its entries and fail the job unless:

```text
manifest.json                       present
service-worker.js                  present
popup/index.html                   present
content/active-scan.js             present
sidepanel/index.html               present
auction-extension/manifest.json    absent
```

- [ ] **Step 7: Run final local verification**

Run exactly:

```bash
npm test
npm run build:extension
```

Both commands must exit 0. Then inspect the generated release ZIP and confirm `manifest.json` is directly at archive root.

- [ ] **Step 8: Commit release/docs changes**

```bash
git add test/extension-release-security.test.js test/extension-integration.test.js README.md docs/BROWSER_EXTENSION.md HOW_TO_INSTALL_AUCTION_EXTENSION.md .github scripts
git commit -m "release: finalize Auction scan search build"
```

- [ ] **Step 9: Run fresh post-commit verification before claiming completion**

Run again:

```bash
npm test
npm run build:extension
```

Also verify the GitHub-published ZIP after the release workflow succeeds. Completion may be claimed only when tests/build/release packaging are green. If no real shopping/visual backend endpoint is configured, report the browser implementation as complete but live provider-backed web search as awaiting that external configuration; do not claim live prices are working.

---

## Self-Review Mapping

- Explicit toolbar scan and arbitrary-page `activeTab` boundary: Tasks 2 and 5.
- Google Images/weak-page visual fallback: Task 3.
- No continuous arbitrary-page reading and no `<all_urls>`: Tasks 2, 5, 10.
- Product identity normalization and low-confidence confirmation: Tasks 1 and 3.
- Provider-neutral trusted/broader shopping architecture and partial failure: Task 7.
- Exact vs similar/rejected configurations and accessory filtering: Task 6.
- New / Refurbished / Used / Unknown separation: Tasks 1, 6, 9.
- Cheapest item vs cheapest confirmed delivered total: Tasks 1, 6, 9.
- Guardian/search-safety authority over suspicious cheap offers: Tasks 6, 9, 10.
- Privacy, bounded messaging, no raw HTML, and no credentials: Tasks 1-5, 7, 10.
- Side-panel states and direct merchant Buy links: Task 9.
- Existing valuation/watchlist/preset behavior preserved: Tasks 8-10.
- Easy-install ZIP with `manifest.json` at extracted root: Task 10.
- Live provider operational dependency is explicit and fail-safe: Tasks 3, 7, 10.

## Self-Review Result

Every approved spec section maps to at least one implementation task. The plan contains no `TBD`, `TODO`, or undefined test-fixture references. ProductIdentity, ScanEvidence, Offer, condition names, message names, status names, and ranking IDs are consistent across tasks. The only external production dependency is an approved secure backend endpoint for credentialed visual recognition and live cross-store provider access; the implementation is explicitly required to degrade to `provider_unavailable` until that endpoint is configured.