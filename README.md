# Auction

Auction is an experimental item-valuation and marketplace-intelligence application focused on turning item information into structured, explainable pricing evidence.

## Current Status

**Runnable valuation engine + marketplace connector foundation + active Base44 application.**

This GitHub repository contains an independently runnable valuation core with automated tests and an official eBay Browse API connector. The working Base44 UI/application source has not yet been exported because direct source access is unavailable through the connected Base44 workspace.

## Implemented Backend Behavior

- sold versus asking-price evidence classification
- comparable deduplication
- USD price normalization
- robust extreme-outlier filtering
- similarity-aware evidence weighting
- stronger weighting for sold evidence
- valuation ranges and confidence scoring
- insufficient-evidence responses instead of fabricated certainty
- marketplace connector registry
- official eBay Browse API search connector for active/asking-price evidence
- automated GitHub Actions test workflow

## Run Locally

Requirements: Node.js 20 or newer.

```bash
git clone https://github.com/Justintech80s/Auction-.git
cd Auction-
npm test
```

Deterministic tests do not require marketplace credentials.

## eBay Connector

Auction's first real marketplace adapter targets eBay's official Browse API. Create an eBay developer application/OAuth access token, copy `.env.example` to your local environment configuration, and provide `EBAY_ACCESS_TOKEN` at runtime.

The connector deliberately labels Browse API search results as **asking-price evidence**. Active listings are not treated as completed sales.

```js
import { searchMarketplace } from './src/connectors/index.js';

const listings = await searchMarketplace('ebay', 'vintage camera model x', {
  accessToken: process.env.EBAY_ACCESS_TOKEN
});
```

No real credentials belong in GitHub.

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
  connectors/
    index.js
    ebay.js
test/
  valuation.test.js
  ebay-connector.test.js
.github/workflows/
  tests.yml
docs/
  ARCHITECTURE.md
  ROADMAP.md
  DATA_QUALITY.md
  SECURITY.md
.env.example
```

## Engineering Principles

1. **Evidence over guesses** — valuations should show where pricing evidence came from.
2. **Sold and asking prices are different signals** — they should never be blended without labeling.
3. **Confidence should be explicit** — sparse or conflicting data should lower confidence.
4. **Legitimate data access** — integrations should use permitted APIs, public search results, or authorized data sources.
5. **Privacy by design** — user uploads and search inputs should not be exposed or committed to the repository.
6. **Testable pricing logic** — normalization, ranking, deduplication, and valuation calculations should be independently testable.

## Next Engineering Milestones

- add fixture-based valuation accuracy benchmarks
- add retry, timeout, and rate-limit behavior around marketplace connectors
- add a separate source of legitimate sold-price evidence
- add item-query planning and comparable similarity scoring
- export and sanitize the Base44 application source when workspace access permits it
- connect the tested valuation pipeline to the application UI

See [`docs/ROADMAP.md`](docs/ROADMAP.md) for the broader staged plan.

## Portfolio Role

Auction represents the commerce/search side of the Justintech80s software portfolio: building software that converts noisy marketplace information into structured, explainable pricing intelligence.

## Related Projects

- [MovieFinder](https://github.com/Justintech80s/MovieFinder) — intelligent movie and streaming discovery
- [Bunny](https://github.com/Justintech80s/Bunny) — noir-inspired interactive entertainment prototype

> Planned capabilities are labeled as milestones. A feature is considered implemented here only when corresponding source and reproducible verification are present.
