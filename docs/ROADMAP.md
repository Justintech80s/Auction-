# Auction Roadmap

This roadmap separates intended development from verified implementation.

## Phase 1 — Public Engineering Foundation

- Document the product problem and architecture.
- Define data-quality and security rules.
- Export and sanitize the existing Base44 source when workspace access permits it.
- Document local setup using the real exported stack.
- Add automated checks before describing source features as production-ready.

## Phase 2 — Evidence Model

- Define a normalized comparable-listing contract.
- Preserve source URL, source type, timestamp, condition, currency, and raw price.
- Explicitly classify asking versus sold evidence when supported by the source.
- Add deterministic price parsing and currency-normalization tests.

## Phase 3 — Comparable Intelligence

- Normalize item attributes.
- Rank exact and near-exact comparables.
- Detect duplicate/reposted listings.
- Down-rank weak category-only matches.
- Add outlier handling and evidence-quality scoring.

## Phase 4 — Valuation Engine

- Calculate evidence-backed price ranges.
- Weight sold evidence separately from asking evidence.
- Produce confidence scores from match quality, source diversity, sample size, and price agreement.
- Return an insufficient-evidence result when a defensible valuation cannot be produced.

## Phase 5 — Marketplace Integrations

- Add permitted marketplace/shopping APIs one connector at a time.
- Add connector-level rate-limit, timeout, and error handling.
- Track evidence provenance through the complete pipeline.
- Test connector normalization against representative fixtures.

## Phase 6 — Production Hardening

- Protect API credentials with managed secrets.
- Validate and limit uploads.
- Add observability around connector failures and valuation quality.
- Add abuse controls and request limits where appropriate.
- Establish retention/deletion rules for uploaded content.

## Phase 7 — Advanced Intelligence

- Improve visual item recognition.
- Add category-specific valuation strategies.
- Learn ranking improvements from verified outcomes without allowing user feedback to overwrite source evidence.
- Explore historical price trends when legitimate historical data is available.

## Completion Standard

A roadmap item is considered implemented only when corresponding source code is present and its critical behavior is verifiable through tests or another reproducible check.
