# Auction Architecture

## Objective

Auction is designed around an evidence pipeline rather than a single AI-generated price guess. Each stage should be independently replaceable and testable.

## Pipeline

### 1. Intake
Accept an item image and/or user description. Validate file type, size, and required input before processing.

### 2. Identification
Extract candidate identity and attributes such as brand, model, category, approximate age, material, edition, visible condition, and other category-specific details.

Identification output should retain uncertainty rather than forcing a single answer when evidence is ambiguous.

### 3. Query Planning
Translate normalized attributes into marketplace-search queries. Generate multiple query variants when necessary while preserving the item's most discriminating attributes.

### 4. Source Connectors
Each marketplace or shopping source should use a connector with a normalized output contract. Connectors should preserve source URL, observed price, currency, listing status, condition, title, timestamp, and whether the evidence represents an asking or sold price when that distinction is available.

### 5. Normalization
Convert evidence into comparable units. Normalize currency, parse prices, map condition labels, reject malformed observations, and retain the original source values for auditability.

### 6. Deduplication and Comparable Ranking
Detect duplicate listings and rank evidence by similarity to the identified item. Exact model/edition matches should generally outrank broad category matches.

### 7. Valuation
Produce a range rather than false precision. Sold evidence should normally carry more weight than asking-price evidence. Outliers and low-similarity comparables should have reduced influence.

### 8. Confidence
Confidence should reflect evidence quantity, evidence quality, match strength, source diversity, agreement between observations, and the availability of sold-price data.

### 9. Presentation
Return the estimated range together with confidence, comparable evidence, source type, and major assumptions so a user can understand why the estimate was produced.

## Boundary Rules

- Marketplace credentials belong in environment variables or managed secret storage, never source control.
- Raw user uploads should not be committed to Git.
- Connectors should not silently convert asking prices into sold prices.
- AI-generated attributes should remain distinguishable from source-confirmed attributes.
- A valuation without adequate evidence should return low confidence or an insufficient-evidence state instead of fabricated certainty.

## Future Public Modules

A source implementation can eventually separate these responsibilities into focused modules such as `identification`, `query-planning`, `connectors`, `normalization`, `ranking`, `valuation`, and `provenance`. Exact paths will follow the exported application's established framework rather than forcing a speculative structure before the source is available.
