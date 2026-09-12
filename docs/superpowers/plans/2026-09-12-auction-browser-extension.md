# Auction Browser Shopping Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Chrome/Edge Manifest V3 browser extension that automatically detects supported shopping/product pages, extracts normalized item data, sends it through Auction's existing intelligence pipeline, and displays an explainable BUY / FAIR / OVERPRICED / MANUAL REVIEW decision in a browser side panel.

**Architecture:** The extension is a thin client. Marketplace-specific adapters extract page data into one normalized product contract; a content scanner and page observer detect product changes; the service worker coordinates messages and analysis requests; the side panel renders results. Auction's existing valuation, sold-evidence, Guardian, and opportunity logic remain authoritative and are not duplicated inside marketplace adapters.

**Tech Stack:** JavaScript (ES modules), Chrome Manifest V3, Chrome Side Panel API, content scripts, service worker, Node.js 20+, existing Auction Node test stack and GitHub Actions CI.

**Spec:** `docs/superpowers/specs/2026-09-12-auction-browser-extension-design.md`

## Global Constraints

- Chromium first: Chrome and Edge are the first supported browsers.
- Manifest V3 only.
- The extension must work without opening the Base44 website first.
- Marketplace text and page content are untrusted input and must never bypass Auction Guardian.
- Asking-price evidence and verified sold evidence remain distinct.
- Strong recommendations require the existing Auction sold-evidence and Guardian rules.
- Do not duplicate valuation or opportunity business rules in marketplace adapters or UI code.
- Keep permissions minimal and limited to supported shopping domains where possible.
- No silent purchasing or checkout automation in the first release.
- No real marketplace credentials committed to GitHub.
- Every implementation task uses deterministic tests before production code.

---

## Planned File Structure

```text
extension/
  manifest.json
  service-worker.js
  content/
    scanner.js
    page-observer.js
    index.js
  adapters/
    contract.js
    registry.js
    ebay.js
    amazon.js
    walmart.js
    bestbuy.js
    generic.js
  messaging/
    messages.js
    auction-client.js
  sidepanel/
    index.html
    app.js
    view-model.js
    styles.css

test/
  extension-adapter-contract.test.js
  extension-adapters.test.js
  extension-scanner.test.js
  extension-page-observer.test.js
  extension-messaging.test.js
  extension-view-model.test.js
  extension-integration.test.js

docs/
  BROWSER_EXTENSION.md
```

Each marketplace adapter has one responsibility: convert a page snapshot into the shared normalized product shape. The scanner chooses an adapter and validates its output. Messaging transports normalized products and analysis results. The view-model converts analysis results into stable UI data. This separation keeps browser DOM parsing independent from Auction's valuation engine.

---

### Task 1: Define the Browser Product Contract and Adapter Registry

**Files:**
- Create: `extension/adapters/contract.js`
- Create: `extension/adapters/registry.js`
- Create: `test/extension-adapter-contract.test.js`

**Interfaces:**
- Produces: `normalizeDetectedProduct(input, context)` returning `{ source, url, title, price, currency, condition, seller, brand, model, category, identifiers, capturedAt }`
- Produces: `assertMarketplaceAdapter(adapter)` validating `{ name, matches(url, documentLike), extract(documentLike, context) }`
- Produces: `registerMarketplaceAdapter(name, adapter)` and `getMarketplaceAdapter(name)`

- [ ] **Step 1: Write failing contract tests**

Create deterministic tests covering valid normalized products, missing title, negative/non-finite price, unsupported currency, malformed URL, oversized fields, and adapter shape validation.

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDetectedProduct, assertMarketplaceAdapter } from '../extension/adapters/contract.js';

test('normalizes a valid detected product', () => {
  const product = normalizeDetectedProduct({
    source: 'ebay',
    url: 'https://www.ebay.com/itm/123',
    title: 'Sony WM-2 Walkman',
    price: 129.99,
    currency: 'USD'
  }, { now: new Date('2026-09-12T12:00:00Z') });

  assert.equal(product.source, 'ebay');
  assert.equal(product.title, 'Sony WM-2 Walkman');
  assert.equal(product.price, 129.99);
  assert.equal(product.currency, 'USD');
});

test('rejects invalid asking price', () => {
  assert.throws(() => normalizeDetectedProduct({
    source: 'ebay',
    url: 'https://www.ebay.com/itm/123',
    title: 'Sony WM-2 Walkman',
    price: -1,
    currency: 'USD'
  }), /price/i);
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `node --test test/extension-adapter-contract.test.js`
Expected: FAIL because the contract module does not exist.

- [ ] **Step 3: Implement the minimal contract and registry**

Validation must bound user/page-controlled strings, require HTTPS product URLs, reject non-positive finite prices when a price is present, accept only explicitly supported currencies for v1 (`USD`), and freeze the normalized object to discourage downstream mutation.

- [ ] **Step 4: Run focused tests and the full suite**

Run:
```bash
node --test test/extension-adapter-contract.test.js
npm test
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add extension/adapters/contract.js extension/adapters/registry.js test/extension-adapter-contract.test.js
git commit -m "feat: add browser product adapter contract"
```

---

### Task 2: Add Marketplace Page Adapters

**Files:**
- Create: `extension/adapters/ebay.js`
- Create: `extension/adapters/amazon.js`
- Create: `extension/adapters/walmart.js`
- Create: `extension/adapters/bestbuy.js`
- Create: `extension/adapters/generic.js`
- Create: `test/extension-adapters.test.js`

**Interfaces:**
- Consumes: `normalizeDetectedProduct(input, context)`
- Produces: adapters exposing `name`, `matches(url, documentLike)`, `extract(documentLike, context)`

- [ ] **Step 1: Write fixture-based failing tests**

Represent DOM access with lightweight fake document objects exposing only the selectors/metadata the adapters consume. Test eBay, Amazon, Walmart, Best Buy, and generic JSON-LD/OpenGraph fallback parsing. Every adapter must return the same normalized product contract.

```js
const fakeDocument = {
  querySelector(selector) {
    const values = new Map([
      ['h1', { textContent: 'Sony WM-2 Walkman' }],
      ['[itemprop="price"]', { getAttribute: () => '129.99' }]
    ]);
    return values.get(selector) ?? null;
  }
};
```

Also test that ambiguous/non-product pages return `null` instead of inventing an item.

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `node --test test/extension-adapters.test.js`
Expected: FAIL because adapters do not exist.

- [ ] **Step 3: Implement adapters with conservative extraction rules**

Prefer structured data (`application/ld+json`, itemprop, OpenGraph) before brittle visual selectors. Site adapters may use site-specific selectors only as fallbacks. Never infer a numeric price from unrelated numbers on the page.

- [ ] **Step 4: Run tests**

Run:
```bash
node --test test/extension-adapters.test.js
npm test
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add extension/adapters test/extension-adapters.test.js
git commit -m "feat: add shopping page adapters"
```

---

### Task 3: Build the Product Scanner and Adapter Selection

**Files:**
- Create: `extension/content/scanner.js`
- Create: `test/extension-scanner.test.js`

**Interfaces:**
- Consumes: marketplace registry/adapters
- Produces: `scanProductPage({ url, documentLike, now }) -> { status, product, adapter }`
- Status values: `detected`, `unsupported`, `invalid`

- [ ] **Step 1: Write failing scanner tests**

Cover correct adapter selection, generic fallback, unsupported pages, adapter exceptions, and malformed adapter output. A bad marketplace page must degrade to `invalid`/`unsupported` rather than crash the extension.

- [ ] **Step 2: Run focused test and confirm RED**

Run: `node --test test/extension-scanner.test.js`

- [ ] **Step 3: Implement scanner**

Selection order must be explicit site adapter first and generic adapter last. Wrap extraction failures and never return raw exception text from untrusted page content.

- [ ] **Step 4: Run tests**

Run:
```bash
node --test test/extension-scanner.test.js
npm test
```

- [ ] **Step 5: Commit**

```bash
git add extension/content/scanner.js test/extension-scanner.test.js
git commit -m "feat: add browser product scanner"
```

---

### Task 4: Detect Product Changes on Single-Page Shopping Sites

**Files:**
- Create: `extension/content/page-observer.js`
- Create: `test/extension-page-observer.test.js`

**Interfaces:**
- Produces: `createProductPageObserver({ locationLike, mutationSource, onChange, debounceMs })`
- Produces observer methods: `start()` and `stop()`

- [ ] **Step 1: Write failing observer tests**

Use injected clock/mutation sources so tests remain deterministic. Verify URL changes trigger once, meaningful DOM mutations debounce to one scan, unchanged pages do not retrigger, and `stop()` prevents later callbacks.

- [ ] **Step 2: Run test and confirm RED**

Run: `node --test test/extension-page-observer.test.js`

- [ ] **Step 3: Implement a bounded debounced observer**

Use `MutationObserver` in production through injection, cap mutation-driven rescans, and compare the current canonical URL before invoking `onChange`.

- [ ] **Step 4: Run tests**

Run:
```bash
node --test test/extension-page-observer.test.js
npm test
```

- [ ] **Step 5: Commit**

```bash
git add extension/content/page-observer.js test/extension-page-observer.test.js
git commit -m "feat: observe shopping page changes"
```

---

### Task 5: Define Extension Messaging and Auction Analysis Bridge

**Files:**
- Create: `extension/messaging/messages.js`
- Create: `extension/messaging/auction-client.js`
- Create: `test/extension-messaging.test.js`

**Interfaces:**
- Produces message types: `AUCTION_PRODUCT_DETECTED`, `AUCTION_ANALYSIS_REQUEST`, `AUCTION_ANALYSIS_RESULT`, `AUCTION_ANALYSIS_ERROR`
- Produces: `createAuctionClient({ analyze })`
- `analyze(product)` receives only normalized product data and returns the Auction analysis object.

- [ ] **Step 1: Write failing messaging tests**

Validate message payload types, reject oversized/unrecognized messages, ensure only normalized product fields cross the boundary, and test safe analysis failure responses.

- [ ] **Step 2: Run test and confirm RED**

Run: `node --test test/extension-messaging.test.js`

- [ ] **Step 3: Implement the bridge**

Map normalized browser products to the existing Auction item input (`brand`, `model`, `category`, title context, acquisition asking price) without embedding valuation thresholds in the extension.

- [ ] **Step 4: Run tests**

Run:
```bash
node --test test/extension-messaging.test.js
npm test
```

- [ ] **Step 5: Commit**

```bash
git add extension/messaging test/extension-messaging.test.js
git commit -m "feat: add browser analysis messaging"
```

---

### Task 6: Connect the Service Worker to Auction's Existing Pipeline

**Files:**
- Create: `extension/service-worker.js`
- Modify only if needed: `src/pipeline.js`
- Test: `test/extension-integration.test.js`

**Interfaces:**
- Consumes: `createAuctionClient`, existing `valueItem(...)`, existing opportunity/sold-evidence/Guardian result shape
- Produces Chrome runtime response payload containing `{ status, valuation, opportunity, soldEvidence, security, provenance }`

- [ ] **Step 1: Write failing integration tests**

Inject a fake `chrome.runtime` message transport and deterministic Auction dependencies. Cover successful analysis, no sold provider, Guardian review, provider failure fallback, and malformed product rejection.

- [ ] **Step 2: Run test and confirm RED**

Run: `node --test test/extension-integration.test.js`

- [ ] **Step 3: Implement minimal service-worker orchestration**

The worker must not contain recommendation thresholds. It delegates to Auction. Preserve the existing behavior that provider failures can fall back safely while Guardian review/reject cannot be upgraded by UI or extension code.

- [ ] **Step 4: Run tests**

Run:
```bash
node --test test/extension-integration.test.js
npm test
```

- [ ] **Step 5: Commit**

```bash
git add extension/service-worker.js src/pipeline.js test/extension-integration.test.js
git commit -m "feat: connect browser extension to auction pipeline"
```

---

### Task 7: Build the Side Panel View Model

**Files:**
- Create: `extension/sidepanel/view-model.js`
- Create: `test/extension-view-model.test.js`

**Interfaces:**
- Produces: `buildAnalysisViewModel(analysis, product)`
- Returns stable display fields: `productTitle`, `currentPrice`, `estimatedValue`, `valueRange`, `verifiedSoldCount`, `potentialProfit`, `confidence`, `decision`, `decisionReason`, `riskState`, `soldEvidenceState`

- [ ] **Step 1: Write failing view-model tests**

Cover `strong_buy`, `buy`, `fair`, `overpriced`, `avoid`, and `manual_review`; missing sold evidence; unavailable sold provider; missing estimate; and Guardian review. Do not test colors or DOM here.

- [ ] **Step 2: Run test and confirm RED**

Run: `node --test test/extension-view-model.test.js`

- [ ] **Step 3: Implement pure view-model mapping**

Use Auction's returned recommendation verbatim. Never recalculate or upgrade a decision in the UI.

- [ ] **Step 4: Run tests**

Run:
```bash
node --test test/extension-view-model.test.js
npm test
```

- [ ] **Step 5: Commit**

```bash
git add extension/sidepanel/view-model.js test/extension-view-model.test.js
git commit -m "feat: add extension analysis view model"
```

---

### Task 8: Build the Browser Side Panel UI

**Files:**
- Create: `extension/sidepanel/index.html`
- Create: `extension/sidepanel/app.js`
- Create: `extension/sidepanel/styles.css`

**Interfaces:**
- Consumes: `buildAnalysisViewModel`
- Displays detected item, asking price, estimated value/range, sold-evidence count/state, potential profit, confidence, Guardian/risk state, and Auction recommendation.

- [ ] **Step 1: Add a DOM rendering test to `test/extension-view-model.test.js` or a focused UI test file using the project's existing dependency policy**

The test must confirm text rendering for a normal BUY result and MANUAL REVIEW result. If the repository has no DOM test dependency, keep `app.js` rendering functions pure enough to test with injected element objects rather than adding a large framework.

- [ ] **Step 2: Run the focused test and confirm RED**

- [ ] **Step 3: Implement the minimal panel**

Required states: `idle`, `scanning`, `analyzing`, `result`, `unsupported`, `error`. Include buttons for `Analyze Again` and `Save` only if Save has a real persistence implementation; otherwise omit Save from v1 rather than ship a dead control.

- [ ] **Step 4: Run focused and full tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add extension/sidepanel test
git commit -m "feat: add auction shopping side panel"
```

---

### Task 9: Wire the Content Script and Manifest V3 Permissions

**Files:**
- Create: `extension/content/index.js`
- Create: `extension/manifest.json`
- Modify: `test/extension-integration.test.js`

**Interfaces:**
- Content script calls scanner on initial load and observer changes.
- Content script emits `AUCTION_PRODUCT_DETECTED` / requests analysis.
- Manifest exposes side panel and service worker.

- [ ] **Step 1: Write manifest/content wiring tests**

Read `manifest.json` as JSON and assert Manifest V3, least-privilege permissions, side panel configuration, service worker path, and supported host patterns. Test content orchestration with injected scanner/observer/runtime objects.

- [ ] **Step 2: Run test and confirm RED**

Run: `node --test test/extension-integration.test.js`

- [ ] **Step 3: Implement manifest and content bootstrap**

Initial supported domains:
- `https://www.ebay.com/*`
- `https://www.amazon.com/*`
- `https://www.walmart.com/*`
- `https://www.bestbuy.com/*`

Use only permissions needed by the implementation, expected to include `sidePanel`, `storage` only if actually used, and host permissions for supported domains. Do not request `<all_urls>` in v1.

- [ ] **Step 4: Run tests**

Run:
```bash
node --test test/extension-integration.test.js
npm test
```

- [ ] **Step 5: Commit**

```bash
git add extension/manifest.json extension/content/index.js test/extension-integration.test.js
git commit -m "feat: wire manifest v3 shopping assistant"
```

---

### Task 10: Add Safe Local Watchlist Persistence

**Files:**
- Create: `extension/storage/watchlist.js`
- Create: `test/extension-watchlist.test.js`
- Modify: `extension/sidepanel/app.js`
- Modify: `extension/manifest.json`

**Interfaces:**
- Produces: `createWatchlistStore(storageArea)` with `save(product, analysis)`, `remove(key)`, `list()`
- Stores only bounded normalized product metadata and selected analysis summary fields; never credentials, raw page HTML, or arbitrary upstream responses.

- [ ] **Step 1: Write failing persistence tests**

Cover save/update deduplication by canonical product URL, maximum record count, removal, malformed stored record cleanup, and absence of secrets/raw HTML.

- [ ] **Step 2: Run test and confirm RED**

Run: `node --test test/extension-watchlist.test.js`

- [ ] **Step 3: Implement bounded `chrome.storage.local` persistence**

Set a deterministic maximum (for example 200 saved products) and evict oldest records first when exceeded. Add the `storage` permission only in this task.

- [ ] **Step 4: Wire a real Save button into the side panel and run tests**

Run:
```bash
node --test test/extension-watchlist.test.js
npm test
```

- [ ] **Step 5: Commit**

```bash
git add extension/storage/watchlist.js extension/sidepanel/app.js extension/manifest.json test/extension-watchlist.test.js
git commit -m "feat: add local auction watchlist"
```

---

### Task 11: Document Local Installation, Privacy, and Supported Sites

**Files:**
- Create: `docs/BROWSER_EXTENSION.md`
- Modify: `README.md`

**Interfaces:**
- Documents unpacked Chrome installation, supported sites, permissions, analysis flow, known limitations, and security/privacy boundaries.

- [ ] **Step 1: Write documentation with exact local install steps**

Include:
1. Clone repository.
2. Run `npm test`.
3. Open `chrome://extensions`.
4. Enable Developer Mode.
5. Choose `Load unpacked`.
6. Select the repository's `extension/` directory.
7. Open a supported product page and the Auction side panel.

Explicitly state that live sold evidence still depends on configured/approved data-provider access and that active asking listings are not relabeled as sold data.

- [ ] **Step 2: Update README product direction and repository structure**

Mark the browser extension as implemented only after source and tests exist.

- [ ] **Step 3: Run full regression**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add docs/BROWSER_EXTENSION.md README.md
git commit -m "docs: document auction browser extension"
```

---

### Task 12: Security Review, CodeQL, and Release Candidate Verification

**Files:**
- Modify only files required by actual findings.
- Potentially modify `.github/workflows/tests.yml` if extension paths need no special handling.

**Interfaces:**
- Produces a verified release-candidate branch suitable for PR review.

- [ ] **Step 1: Run full regression before review**

Run: `npm test`
Expected: PASS. If anything fails, read the exact assertion/stack trace before changing code.

- [ ] **Step 2: Review extension attack surfaces**

Verify:
- no `eval` or dynamic code execution
- no `<all_urls>` permission
- no credentials in manifest/source/tests
- no raw page HTML stored or transmitted
- external page strings are rendered as text, not injected HTML
- marketplace adapters cannot override Guardian or recommendation state
- redirects/network access still follow existing Auction policy
- messages reject unknown/oversized payloads

- [ ] **Step 3: Push branch and open PR to `main`**

PR summary must describe supported browsers/sites, permissions, architecture, tests, and known limitations.

- [ ] **Step 4: Require GitHub Actions Tests and CodeQL green**

Inspect failed workflow job logs before any fix. Do not merge on red.

- [ ] **Step 5: Review the PR diff for duplicated business logic and permission creep**

Specifically reject any code that recalculates Auction recommendations in adapters, service worker, or UI.

- [ ] **Step 6: Merge only after tests, CodeQL, and review are green**

Target release state: installable unpacked Chrome/Edge extension, deterministic automated tests, documented permissions/security boundaries, and existing Auction decision engine preserved as authority.
