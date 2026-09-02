# Auction

Auction is an experimental item-valuation and marketplace-intelligence application focused on helping users turn an uploaded item into structured pricing evidence.

## Product Goal

The long-term goal is to identify an item, research comparable listings across legitimate marketplaces and shopping sources, distinguish asking prices from verified sold-price evidence when available, and return a clearer valuation range with supporting context.

## Current Status

**Active Base44 application / public GitHub engineering shell.**

The working application currently lives in Base44. Direct source export from the connected Base44 workspace is not available yet, so this repository intentionally does **not** claim that the production application source is mirrored here.

This repository documents the architecture, public development direction, and engineering standards that will guide the GitHub version when source access is available.

## Core Product Direction

- Item image/upload intake
- Item identification and attribute extraction
- Marketplace research across legitimate sources
- Asking-price versus sold-price separation
- Comparable-item ranking
- Duplicate and low-quality listing filtering
- Price normalization across currencies and conditions
- Confidence-aware valuation ranges
- Evidence links and provenance
- Privacy-conscious upload handling

## Proposed Architecture

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

## Engineering Principles

1. **Evidence over guesses** — valuations should show where pricing evidence came from.
2. **Sold and asking prices are different signals** — they should never be blended without labeling.
3. **Confidence should be explicit** — sparse or conflicting data should lower confidence.
4. **No secret scraping assumptions** — integrations should use legitimate APIs, public search results, or permitted data sources.
5. **Privacy by design** — user uploads and search inputs should not be exposed or committed to the repository.
6. **Testable pricing logic** — normalization, ranking, deduplication, and valuation calculations should be independently testable.

## Repository Structure

```text
docs/
  ARCHITECTURE.md
  ROADMAP.md
  DATA_QUALITY.md
  SECURITY.md
```

Application source will be added only after it can be exported and sanitized safely.

## Development Roadmap

See [`docs/ROADMAP.md`](docs/ROADMAP.md) for the staged development plan.

## Portfolio Role

Auction represents the commerce/search side of the Justintech80s software portfolio: building software that converts noisy marketplace information into structured, explainable pricing intelligence.

## Related Projects

- [MovieFinder](https://github.com/Justintech80s/MovieFinder) — intelligent movie and streaming discovery
- [Bunny](https://github.com/Justintech80s/Bunny) — noir-inspired interactive entertainment prototype

> Roadmap items describe intended development direction. They should not be interpreted as completed production features unless the repository contains the corresponding implementation and tests.
