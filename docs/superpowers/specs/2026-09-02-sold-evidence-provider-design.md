# Auction Sold Evidence Provider Design

## Goal

Add a trustworthy sold-price evidence subsystem to Auction without pretending that active asking prices are completed sales. The subsystem must make sold evidence explicit, provenance-rich, independently testable, and compatible with Auction Guardian, valuation, and opportunity scoring.

## Architectural Direction

Auction will introduce a provider-neutral sold-evidence layer. The first production adapter target is eBay Marketplace Insights when approved access and credentials are available. Fixture/test providers make the contract executable today without fake production data. Seller-authorized transaction history may be supported separately, but it must be labeled as seller-scoped evidence rather than broad market evidence.

Scraping public sold pages is not part of the core architecture. The system should prefer legitimate APIs and approved data sources because they are more stable, easier to debug, and easier to keep compliant.

## Evidence Contract

Every normalized sold record must carry:

- `source`
- `sourceId`
- `title`
- `soldPrice`
- `currency`
- `soldAt`
- `verification`
- `provenance`
- `freshness`
- optional `url`
- optional `condition`

`verification` must distinguish at least `verified_sale`, `seller_scoped_sale`, and `unverified_sale_claim`.

`freshness` must make age explicit rather than leaving stale evidence indistinguishable from recent evidence.

## Provider Contract

A sold provider implements a narrow interface:

```js
searchSoldEvidence(query, options) -> Promise<NormalizedSoldEvidence[]>
```

Provider-specific authentication, endpoints, pagination, and raw response shapes stay inside the adapter. The rest of Auction consumes only normalized sold evidence.

## Normalization

A dedicated normalizer converts provider records into Auction's sold-evidence schema. It must:

- reject missing source IDs
- reject non-positive prices
- reject unsupported currencies rather than silently converting
- bound titles, IDs, URLs, and text fields
- parse and validate sale timestamps
- attach explicit verification level
- attach freshness metadata
- preserve provider provenance

## Guardian Verification

Auction Guardian must treat sold records as untrusted until validated. It should flag or reject:

- impossible or malformed prices
- future sale timestamps
- duplicate sold IDs
- contradictory source/provenance claims
- unverified records represented as verified
- suspiciously stale data when a fresh comparison is required
- malformed URLs or provenance fields

A Guardian `review` or `reject` decision must prevent sold evidence from creating a stronger Opportunity Engine recommendation.

## Evidence Merge

Asking-price and sold-price evidence remain separate signals. A focused merge function will combine them into one comparable collection only after each record is labeled with its evidence type and verification level.

The merge layer must never rewrite asking evidence as sold evidence. Verified sold evidence receives stronger valuation weight than asking evidence. Seller-scoped evidence may receive useful but lower-confidence weight than broad verified market sales.

## Valuation Integration

The valuation engine should consume normalized evidence with explicit `status` / `evidenceType` and verification metadata. Existing deterministic behavior remains intact.

If verified sold evidence exists, valuation confidence can rise according to sample size, similarity, freshness, and source agreement. If no verified sold evidence exists, Auction must say so rather than manufacture certainty.

## Opportunity Integration

The Opportunity Engine should use sold-evidence quality as a confidence gate. A cheap asking price alone should not create a `strong_buy` recommendation when sold evidence is absent, stale, or disputed.

Recommended behavior:

- verified recent sales can support `strong_buy` / `buy`
- asking-only evidence can still produce a valuation, but opportunity confidence must be reduced
- Guardian `review` or `reject` forces `manual_review`
- unverified sold claims cannot increase recommendation strength

## Debugging and Clean-Code Rules

Auction development will explicitly follow these build rules:

1. Read the exact failing assertion, stack trace, and upstream error before changing code.
2. Fix the root cause, not merely the symptom.
3. Use descriptive names such as `normalizeSoldRecord`, `validateSoldEvidence`, and `mergeMarketEvidence`.
4. Keep functions short and focused on one responsibility.
5. Refactor duplicated or confusing code before layering new complexity on top of it.
6. Break large features into small testable units with clear contracts.
7. Prefer deterministic tests and fixture providers over live credentials in CI.
8. Keep provider-specific behavior isolated so one marketplace integration can be rewritten without changing valuation logic.

## File Boundaries

Planned responsibilities:

- `src/sold-evidence/provider-contract.js` — provider interface validation
- `src/sold-evidence/normalize.js` — sold record normalization and freshness
- `src/sold-evidence/registry.js` — provider registration and lookup
- `src/sold-evidence/merge.js` — sold + asking evidence composition
- `src/sold-evidence/providers/ebay-marketplace-insights.js` — eBay production adapter when access exists
- `src/sold-evidence/providers/fixture.js` — deterministic test/demo provider
- `src/security/sold-evidence-risk.js` — Guardian sold-evidence checks
- `src/pipeline.js` — orchestration only; no provider-specific logic

## Testing Strategy

Test-first coverage must include:

- provider contract rejects malformed providers
- normalization rejects missing IDs and bad prices
- normalization rejects unsupported currency
- future sold timestamps are rejected or reviewed
- duplicate sold records are detected
- unverified claims cannot masquerade as verified sales
- asking and sold evidence remain distinctly labeled after merge
- verified sales increase valuation authority relative to asking-only evidence
- no-sold-data path remains deterministic and explicit
- Guardian review/reject prevents strong opportunity recommendations
- provider timeout/failure leaves the existing valuation pipeline available
- eBay adapter tests use injected fetch and fixture payloads, never real credentials

## Production Constraints

The eBay Marketplace Insights adapter is conditional on approved API access. Auction must not claim it can fetch broad eBay sold history until that access is actually configured and verified.

The initial merge can ship with the provider contract, fixture provider, normalization, Guardian checks, and pipeline support even before production Marketplace Insights credentials exist.

## Success Criteria

The feature is complete when Auction can ingest normalized sold evidence through a provider-neutral contract, verify it through Guardian, keep asking and sold evidence distinct, use verified sold evidence to improve valuation/opportunity decisions, degrade safely when sold evidence is unavailable, and pass deterministic CI tests with clean modular code.
