# Auction

Auction is an experimental item-valuation and marketplace-intelligence application focused on turning item information into structured, explainable pricing evidence.

## Current Status

**Runnable valuation engine + marketplace connector foundation + Auction Guardian security layer + optional bounded AI risk enrichment.**

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
- Guardian request validation and bounded field sizes
- outbound HTTPS host allowlisting and SSRF/private-network blocking helpers
- injectable in-memory rate limiting
- deterministic anomaly/risk scoring with allow/review/reject decisions
- privacy-conscious structured security-event storage
- optional AI security analysis with strict output validation, bounded evidence, timeout/failure fallback, and evidence-ID validation
- deterministic security decisions remain authoritative over AI suggestions
- provenance records attached to protected valuation results
- eBay connector timeouts, bounded result limits, redirect blocking, and safe upstream errors
- automated GitHub Actions tests and CodeQL workflow

## Run Locally

Requirements: Node.js 20 or newer.

```bash
git clone https://github.com/Justintech80s/Auction-.git
cd Auction-
npm test
```

Deterministic tests do not require marketplace or AI credentials.

## Protected Valuation Pipeline

```js
import { valueItem } from './src/pipeline.js';

const result = await valueItem(
  { brand: 'Sony', model: 'WM-2', category: 'Walkman' },
  {
    guardian: true,
    source: 'ebay',
    connectorOptions: { accessToken: process.env.EBAY_ACCESS_TOKEN }
  }
);

console.log(result.valuation);
console.log(result.security);
console.log(result.provenance);
```

AI enrichment is optional. When no AI provider is supplied, Auction continues through the deterministic valuation + risk path. When an AI provider fails, times out, or returns malformed output, the deterministic result remains available and authoritative.

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

The larger product direction is to identify an uploaded item, research comparable listings across legitimate marketplaces and shopping sources, distinguish asking prices from verified sold-price evidence when available, and return a valuation range with supporting context, confidence, provenance, and security/risk signals.

## Protected Pipeline

```text
User / API Request
    |
    v
Auction Guardian Gateway
    |
    v
Marketplace Connector + Network Policy
    |
    v
Comparable Ranking + Normalization
    |
    v
Valuation Engine
    |
    v
Deterministic Risk Engine
    |
    +--> Optional bounded AI Security Brain
    |
    v
Provenance + Explainable Result
```

## Repository Structure

```text
src/
  intelligence.js
  pipeline.js
  valuation.js
  connectors/
    index.js
    ebay.js
  security/
    gateway.js
    url-policy.js
    rate-limit.js
    risk-engine.js
    events.js
  ai/
    provider-contract.js
    provider-registry.js
    security-brain.js
test/
  valuation.test.js
  intelligence.test.js
  pipeline.test.js
  guardian-security.test.js
  ai-security.test.js
  protected-pipeline.test.js
  ebay-connector.test.js
.github/workflows/
  tests.yml
  codeql.yml
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
4. **Deterministic policy outranks AI** — AI may enrich and explain, but cannot silently override a security block or valuation invariant.
5. **Treat external content as untrusted** — marketplace text and metadata are data, not instructions.
6. **Legitimate data access** — integrations should use permitted APIs, public search results, or authorized data sources.
7. **Privacy by design** — user uploads, credentials, and unnecessary raw upstream content should not be exposed or committed.
8. **Testable pricing and security logic** — normalization, ranking, valuation, risk, AI fallback, and security controls should be independently testable.

## Next Engineering Milestones

- add a separate source of legitimate sold-price evidence
- add durable/distributed rate limiting for production deployment
- add durable security-event storage and observability
- add additional marketplace connectors with the same trust-boundary rules
- add a production AI provider adapter behind the existing provider contract
- export and sanitize the Base44 application source when workspace access permits it
- connect the protected valuation pipeline to the application UI

See [`docs/ROADMAP.md`](docs/ROADMAP.md) for the broader staged plan.

## Portfolio Role

Auction represents the commerce/search side of the Justintech80s software portfolio: building software that converts noisy marketplace information into structured, explainable pricing intelligence while treating external evidence and AI output as untrusted by default.

## Related Projects

- [MovieFinder](https://github.com/Justintech80s/MovieFinder) — intelligent movie and streaming discovery
- [Bunny](https://github.com/Justintech80s/Bunny) — noir-inspired interactive entertainment prototype

> Planned capabilities are labeled as milestones. A feature is considered implemented here only when corresponding source and reproducible verification are present.
