# Auction Sold Evidence Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add trustworthy, provider-neutral sold-price evidence to Auction while keeping asking evidence distinct and preserving deterministic valuation when sold data is unavailable.

**Architecture:** Introduce small modules for provider validation, normalization, registry lookup, evidence merging, and Guardian sold-evidence checks. Pipeline orchestration requests sold evidence only through the provider contract, merges normalized evidence with existing asking comparables, and lets valuation/opportunity logic use explicit verification metadata without provider-specific knowledge.

**Tech Stack:** Node.js ES modules, built-in `node:test`, existing Auction Guardian/security modules, injected `fetch` for provider tests.

**Spec:** `docs/superpowers/specs/2026-09-02-sold-evidence-provider-design.md`

## Global Constraints

- Never represent active asking-price evidence as completed-sale evidence.
- Keep provider-specific authentication/endpoints/raw response shapes inside provider adapters.
- CI must not require live marketplace credentials.
- Unsupported currencies are rejected rather than silently converted.
- Guardian review/reject must prevent sold evidence from strengthening an opportunity recommendation.
- Production eBay sold-history support is conditional on approved Marketplace Insights access.
- Functions remain short, focused, descriptively named, and deterministic where possible.
- Debug failures from exact assertions/stack traces and fix root causes rather than symptoms.

---

### Task 1: Sold Evidence Contract and Normalizer

**Files:**
- Create: `src/sold-evidence/provider-contract.js`
- Create: `src/sold-evidence/normalize.js`
- Test: `test/sold-evidence-normalize.test.js`

**Interfaces:**
- Produces: `assertSoldEvidenceProvider(provider)` and `normalizeSoldRecord(record, options)`.
- `normalizeSoldRecord` returns `{ source, sourceId, title, soldPrice, price, currency, soldAt, verification, provenance, freshness, url, condition, status: 'sold', evidenceType: 'sold' }`.

- [ ] **Step 1: Write failing tests** for malformed providers, missing IDs, non-positive prices, unsupported currencies, invalid/future timestamps, bounded fields, and verified normalized output.
- [ ] **Step 2: Run** `node --test test/sold-evidence-normalize.test.js` and confirm failure is caused by missing modules/behavior.
- [ ] **Step 3: Implement minimal focused functions**: provider contract validation, USD-only price normalization, timestamp validation, verification allowlist, freshness age calculation, and bounded strings.
- [ ] **Step 4: Run** `node --test test/sold-evidence-normalize.test.js` and confirm all tests pass.
- [ ] **Step 5: Commit** with `feat: add sold evidence contract and normalization`.

### Task 2: Registry, Fixture Provider, and Evidence Merge

**Files:**
- Create: `src/sold-evidence/registry.js`
- Create: `src/sold-evidence/providers/fixture.js`
- Create: `src/sold-evidence/merge.js`
- Test: `test/sold-evidence-merge.test.js`

**Interfaces:**
- Consumes: `assertSoldEvidenceProvider`, `normalizeSoldRecord`.
- Produces: `createSoldEvidenceRegistry(initialProviders)`, `createFixtureSoldProvider(records)`, `mergeMarketEvidence(askingEvidence, soldEvidence)`.

- [ ] **Step 1: Write failing tests** proving registry lookup rejects unknown providers, fixture search is deterministic, duplicates are removed by source/sourceId, and asking/sold labels remain distinct.
- [ ] **Step 2: Run** `node --test test/sold-evidence-merge.test.js` and inspect the exact failing assertions.
- [ ] **Step 3: Implement registry, fixture provider, and merge functions** with no marketplace-specific logic in merge.
- [ ] **Step 4: Run** the focused test file until green.
- [ ] **Step 5: Commit** with `feat: add sold evidence registry and merge`.

### Task 3: Guardian Sold-Evidence Verification

**Files:**
- Create: `src/security/sold-evidence-risk.js`
- Test: `test/sold-evidence-risk.test.js`

**Interfaces:**
- Produces: `assessSoldEvidenceRisk(records, options)` returning `{ decision, riskScore, riskBand, signals, accepted, rejected }`.

- [ ] **Step 1: Write failing tests** for duplicate IDs, future timestamps, unverified claims, stale records, malformed provenance, and clean verified sales.
- [ ] **Step 2: Run** `node --test test/sold-evidence-risk.test.js` and verify failures correspond to the intended missing checks.
- [ ] **Step 3: Implement deterministic risk checks** with explicit reason codes and no AI dependency.
- [ ] **Step 4: Run** focused tests and keep functions separated by signal responsibility.
- [ ] **Step 5: Commit** with `feat: add Guardian sold evidence verification`.

### Task 4: eBay Marketplace Insights Adapter Boundary

**Files:**
- Create: `src/sold-evidence/providers/ebay-marketplace-insights.js`
- Test: `test/ebay-sold-evidence.test.js`

**Interfaces:**
- Produces: `createEbayMarketplaceInsightsProvider(options)` implementing `searchSoldEvidence(query, options)`.
- Consumes: injected `fetchImpl`, access token, fixed approved endpoint/host policy, `normalizeSoldRecord`.

- [ ] **Step 1: Write failing tests** using injected fake fetch for missing credentials, timeout, non-OK response, malformed payload, redirect rejection, and valid normalized records.
- [ ] **Step 2: Run** `node --test test/ebay-sold-evidence.test.js` and diagnose failures from the actual error output.
- [ ] **Step 3: Implement the adapter** with bounded query/limit, server-side token use, AbortController timeout, `redirect: 'error'`, safe errors, and no claim of availability without credentials/access.
- [ ] **Step 4: Run** focused adapter tests with no live network calls.
- [ ] **Step 5: Commit** with `feat: add eBay sold evidence adapter boundary`.

### Task 5: Valuation Weighting and Sold-Evidence Quality

**Files:**
- Modify: `src/valuation.js`
- Test: `test/valuation.test.js`
- Create: `test/sold-evidence-valuation.test.js`

**Interfaces:**
- Consumes merged comparable records with `evidenceType` and `verification`.
- Produces existing `estimateValue(comparables)` result plus `verifiedSoldCount` and `soldEvidenceQuality` without breaking current callers.

- [ ] **Step 1: Write failing tests** proving verified sold evidence has more authority than asking evidence, seller-scoped evidence has less authority than verified market sales, and unverified claims cannot increase confidence.
- [ ] **Step 2: Run** valuation tests and identify exact regressions before editing implementation.
- [ ] **Step 3: Refactor evidence weighting into a small named helper** and add sold-evidence quality metrics while preserving existing deterministic outputs where metadata is absent.
- [ ] **Step 4: Run** `node --test test/valuation.test.js test/sold-evidence-valuation.test.js`.
- [ ] **Step 5: Commit** with `feat: weight verified sold evidence in valuation`.

### Task 6: Pipeline and Opportunity Integration

**Files:**
- Modify: `src/pipeline.js`
- Modify: `src/opportunity.js`
- Test: `test/sold-evidence-pipeline.test.js`
- Test: `test/opportunity-engine.test.js`

**Interfaces:**
- Pipeline options add `soldEvidenceProvider`, `soldEvidenceOptions`, and `requireFreshSoldEvidence`.
- Pipeline result adds `soldEvidence: { status, provider, count, verifiedCount, risk }`.
- Opportunity evaluation consumes sold-evidence quality as an optional confidence gate.

- [ ] **Step 1: Write failing integration tests** for verified sold evidence, no provider, provider failure fallback, Guardian review/reject, and asking-only prevention of `strong_buy`.
- [ ] **Step 2: Run** the focused integration tests and inspect exact stack traces/assertions.
- [ ] **Step 3: Add small pipeline helpers** to fetch/normalize/verify/merge sold evidence without embedding provider-specific logic in `pipeline.js`.
- [ ] **Step 4: Update opportunity classification** so missing/disputed sold evidence cannot produce `strong_buy`, while preserving existing behavior when the new gate is not requested by callers.
- [ ] **Step 5: Run** focused pipeline/opportunity tests until green.
- [ ] **Step 6: Commit** with `feat: integrate sold evidence into auction decisions`.

### Task 7: Documentation, Regression Verification, and Security Scan

**Files:**
- Modify: `README.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `.env.example` only if the adapter requires a documented optional credential name.

**Interfaces:**
- Documents the provider contract, explicit asking-vs-sold distinction, safe fallback behavior, and conditional eBay Marketplace Insights configuration.

- [ ] **Step 1: Update docs** with exact behavior and no claim that broad eBay sold history works without approved access.
- [ ] **Step 2: Run** `npm test` and require all existing + new tests to pass.
- [ ] **Step 3: Inspect any failure from its exact test name/assertion/stack trace; fix root cause and rerun the narrow test before the full suite.**
- [ ] **Step 4: Push/open PR and require the repository Tests workflow and CodeQL to complete successfully.**
- [ ] **Step 5: Review changed files for short functions, descriptive names, duplicated logic, leaked credentials, and accidental asking-to-sold relabeling.**
- [ ] **Step 6: Merge only after verification is green.**
