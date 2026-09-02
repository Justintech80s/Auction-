# Data Quality

Auction's usefulness depends more on evidence quality than on producing a number quickly.

## Evidence Classes

### Sold evidence
A source explicitly indicates that a transaction or completed sale occurred. This is generally the strongest pricing signal when the item is genuinely comparable.

### Asking-price evidence
A seller is requesting a price, but the listing does not prove a buyer paid that amount. Asking prices are useful context but should remain labeled as such.

### Reference evidence
Catalogs, retail pages, manufacturer information, or other sources may help identify an item or establish original pricing but do not necessarily establish current resale value.

## Required Comparable Fields

When available, each normalized observation should preserve:

- source
- source URL or source identifier
- listing title
- observed price
- original currency
- normalized price
- condition
- evidence class
- observation timestamp
- normalized item attributes
- similarity/match score

## Quality Rules

- Never label an asking price as a sold price without source evidence.
- Preserve original values alongside normalized values.
- Remove or down-rank duplicate listings.
- Do not hide extreme values merely because they are inconvenient; classify/down-weight them using reproducible rules.
- Prefer exact model, edition, size, material, and condition matches over broad category matches.
- Surface insufficient evidence rather than inventing a confident estimate.

## Confidence Inputs

A future confidence model should consider at least:

1. number of usable comparables
2. proportion of sold evidence
3. item-match similarity
4. source diversity
5. price dispersion
6. evidence recency
7. identification certainty

Confidence is a statement about evidence strength, not a guarantee that an item will sell at the estimated price.
