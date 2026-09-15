# Auction Shared Backend Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make one click on `Scan This Product` persist the scan state, call a shared HTTPS Auction product-scan backend, and render Product Identified, Lowest Price Found, Price Comparison, Visit Store, and Savings Tips entirely inside the browser sidebar.

**Architecture:** Keep the extension as a bounded capture/presentation layer. Add one strict shared-backend result contract and a session-state store, make the service worker persist and broadcast every scan transition, and hydrate the side panel from the last state when it opens late. Preserve the existing local matcher/ranker path as a deterministic fallback/test seam, but production shared-backend results remain the source of live shopping data.

**Tech Stack:** JavaScript ES modules, Chrome Manifest V3 messaging/storage, Node.js `node:test`.

**Spec:** `docs/superpowers/specs/2026-09-14-auction-shared-backend-sidebar-design.md`

## Global Constraints

- HTTPS only for the shared backend and Visit Store URLs.
- Never persist raw HTML, cookies, credentials, checkout data, or arbitrary page content.
- Keep request/response data bounded and schema validated.
- No provider credentials in the extension.
- Guardian-rejected offers must never be highlighted as the lowest-price recommendation.
- Unknown shipping stays unknown.
- No automated checkout or purchases.

---

### Task 1: Shared product-scan backend contract

**Files:**
- Modify: `src/connectors/product-search-backend.js`
- Modify: `test/product-search-backend.test.js`

**Interfaces:**
- Consumes: bounded scan evidence from `normalizeScanEvidence`.
- Produces: `backend.scanProduct(evidence)` returning the normalized shared website-style result contract.

- [ ] **Step 1: Write a failing test** proving `scanProduct` sends only bounded evidence and returns normalized `identifiedProduct`, `lowestPrice`, `priceComparison`, `savingsTips`, and `providerErrors`.
- [ ] **Step 2: Run the focused test and verify RED.**
- [ ] **Step 3: Implement minimal strict normalization and HTTPS URL filtering.**
- [ ] **Step 4: Run focused and existing backend tests and verify GREEN.**
- [ ] **Step 5: Commit.**

### Task 2: Persisted scan session and hydration messages

**Files:**
- Create: `extension/storage/scan-session.js`
- Modify: `extension/messaging/messages.js`
- Create: `test/extension-scan-session.test.js`
- Modify: `test/extension-messaging.test.js`

**Interfaces:**
- Consumes: bounded state transitions from the service worker.
- Produces: `createScanSessionStore(storageArea)` with `get`, `set`, `clear`; `SCAN_SESSION_REQUEST`; `SCAN_SESSION_STATE`.

- [ ] **Step 1: Write failing tests** for bounded state persistence, forbidden raw page fields, and session request/state validation.
- [ ] **Step 2: Run focused tests and verify RED.**
- [ ] **Step 3: Implement the store and message types.**
- [ ] **Step 4: Run focused tests and verify GREEN.**
- [ ] **Step 5: Commit.**

### Task 3: Service-worker shared-backend orchestration

**Files:**
- Modify: `extension/service-worker.js`
- Create: `test/extension-shared-backend-integration.test.js`
- Modify: `test/helpers/worker-scan-harness.js`

**Interfaces:**
- Consumes: `sharedBackend.scanProduct(evidence)` and `scanSessionStore`.
- Produces: persisted `scanning` → final-state transitions, `SCAN_SESSION_REQUEST` response, and best-effort broadcasts.

- [ ] **Step 1: Write a failing race-regression test** where the scan completes before the panel listener exists and later session retrieval still returns the final result.
- [ ] **Step 2: Run focused test and verify RED.**
- [ ] **Step 3: Wire state persistence and shared-backend orchestration while preserving injected legacy test seams.**
- [ ] **Step 4: Run integration tests and verify GREEN.**
- [ ] **Step 5: Commit.**

### Task 4: Website-style sidebar hydration and results

**Files:**
- Modify: `extension/sidepanel/app.js`
- Modify: `extension/sidepanel/index.html`
- Modify: `extension/sidepanel/styles.css`
- Modify: `test/extension-cross-store-ui.test.js`
- Modify: `test/extension-sidepanel.test.js`

**Interfaces:**
- Consumes: `SCAN_SESSION_STATE` shared result.
- Produces: Product Identified, Lowest Price Found, Price Comparison, sanitized Visit Store links, Savings Tips, and visible unavailable/no-results/needs-confirmation states.

- [ ] **Step 1: Write failing UI tests** for late hydration and all required result sections.
- [ ] **Step 2: Run focused tests and verify RED.**
- [ ] **Step 3: Implement render/hydration logic and markup.**
- [ ] **Step 4: Run focused UI tests and verify GREEN.**
- [ ] **Step 5: Commit.**

### Task 5: Production configuration, security, and release gate

**Files:**
- Modify: `extension/manifest.json` only if a concrete backend origin is available.
- Modify: `.env.example` / documentation as appropriate.
- Modify: `test/extension-release-security.test.js`
- Modify: `docs/BROWSER_EXTENSION.md`

**Interfaces:**
- Consumes: a concrete shared Auction backend HTTPS endpoint when available.
- Produces: a release that fails safely as `provider_unavailable` when the backend is not configured and never embeds secrets.

- [ ] **Step 1: Write/extend security tests** for no secrets, no `<all_urls>`, HTTPS-only links, and bounded persisted state.
- [ ] **Step 2: Run tests and verify RED for any missing release rule.**
- [ ] **Step 3: Implement the minimum configuration/documentation changes.**
- [ ] **Step 4: Run `npm test` and `npm run build:extension`; verify all pass.**
- [ ] **Step 5: Commit, open a PR, and verify CI before merging.**
