# Auction

Auction is an experimental item-valuation and marketplace-intelligence application focused on turning item information into structured, explainable pricing evidence.

## Current Status

**Runnable valuation-core prototype + active Base44 application.**

This GitHub repository now contains a small, independently runnable valuation core with automated tests. The working Base44 UI/application source has not yet been exported because direct source access is unavailable through the connected Base44 workspace.

The GitHub implementation therefore focuses on verified backend behavior rather than pretending the unavailable Base44 source is already mirrored here.

## What Works in This Repository

The current valuation core can:

- distinguish explicit sold evidence from asking-price evidence
- deduplicate comparables using source identifiers
- weight sold evidence more strongly than asking prices
- account for comparable similarity
- reject weak evidence rather than returning false precision
- run automatically through GitHub Actions on pushes and pull requests

## Run Locally

Requirements: Node.js 20 or newer.

```bash
git clone https://github.com/Justintech80s/Auction-.git
cd Auction-
npm test
```

No API credentials are required for the current deterministic valuation-core tests.

## Product Goal

The larger product direction is to identify an uploaded item, research comparable listings across legitimate marketplaces and shopping sources, distinguish asking prices from verified sold-price evidence when available, and return a valuation range with supporting context and confidence.

## Target Pipeline

```text
User Upload
    |
    v
Item Identification
    |
    v
Attribute Normalization
    |
    v
Marketplace Connectors
    |
    +--> Asking-price listings
    +--> Sold-price evidence
    |
    v
Comparable Ranking + Deduplication
    |
    v
Price Normalization
    |
    v
Valuation Engine
    |
    v
Evidence-backed Result
```

## Repository Structure

```text
src/
  valuation.js
test/
  valuation.test.js
.github/workflows/
  tests.yml
docs/
  ARCHITECTURE.md
  ROADMAP.md
  DATA_QUALITY.md
  SECURITY.md
```

## Engineering Principles

1. **Evidence over guesses** — valuations should show where pricing evidence came from.
2. **Sold and asking prices are different signals** — they should never be blended without labeling.
3. **Confidence should be explicit** — sparse or conflicting data should lower confidence.
4. **Legitimate data access** — integrations should use permitted APIs, public search results, or authorized data sources.
5. **Privacy by design** — user uploads and search inputs should not be exposed or committed to the repository.
6. **Testable pricing logic** — normalization, ranking, deduplication, and valuation calculations should be independently testable.

## Next Engineering Milestones

- expand deterministic price normalization and outlier handling
- define a normalized marketplace connector contract
- integrate the first permitted real marketplace/data source
- add confidence scoring and valuation ranges
- add fixture-based accuracy benchmarks
- export and sanitize the Base44 application source when workspace access permits it
- connect the tested valuation core to the application UI

See [`docs/ROADMAP.md`](docs/ROADMAP.md) for the broader staged plan.

## Portfolio Role

Auction represents the commerce/search side of the Justintech80s software portfolio: building software that converts noisy marketplace information into structured, explainable pricing intelligence.

## Related Projects

- [MovieFinder](https://github.com/Justintech80s/MovieFinder) — intelligent movie and streaming discovery
- [Bunny](https://github.com/Justintech80s/Bunny) — noir-inspired interactive entertainment prototype

> Planned capabilities are labeled as milestones. A feature is considered implemented here only when corresponding source and reproducible verification are present.
