# Auction Net Profit / Cost Engine Design

## Goal

Add a deterministic cost engine so Auction can distinguish gross spread from realistic net economics without inventing marketplace fees or silently changing legacy behavior.

## Scope

The first production-safe cost model supports explicit caller-supplied costs only:

- marketplace fee
- shipping
- tax
- repairs
- payment processing
- holding cost

No marketplace-specific fee tables or inferred costs are introduced in this phase.

## Architecture

Create `src/costs/engine.js` as the single authority for cost normalization and net-profit calculations. `src/opportunity.js` consumes that engine and remains the single authority for opportunity decisions. `src/pipeline.js` passes optional cost inputs through to Opportunity.

The cost engine must be independently testable and have no marketplace, browser, or UI dependency.

## Input Contract

`calculateNetEconomics({ acquisitionPrice, estimatedValue, costs })`

`costs` is optional. Supported fields:

```js
{
  marketplaceFee: number,
  shipping: number,
  tax: number,
  repairs: number,
  paymentProcessing: number,
  holding: number
}
```

All supplied values must be finite and non-negative. Missing fields are treated as zero. Unknown fields are ignored rather than persisted into the calculation result.

## Output Contract

The engine returns:

```js
{
  costBreakdown: {
    marketplaceFee,
    shipping,
    tax,
    repairs,
    paymentProcessing,
    holding
  },
  totalCosts,
  grossProfit,
  grossMarginPct,
  netProfit,
  netMarginPct
}
```

Money values are rounded to two decimals. Margin percentages are rounded to two decimals.

Definitions:

- `grossProfit = estimatedValue - acquisitionPrice`
- `grossMarginPct = grossProfit / estimatedValue * 100`
- `totalCosts = sum(explicit costs)`
- `netProfit = grossProfit - totalCosts`
- `netMarginPct = netProfit / estimatedValue * 100`

`estimatedValue` must be positive. `acquisitionPrice` must be finite and non-negative.

## Opportunity Integration

`evaluateOpportunity()` keeps its existing fields for compatibility:

- `expectedProfit` continues to mean gross profit
- `expectedMarginPct` continues to mean gross margin

When `costs` is supplied, Opportunity additionally returns:

- `costBreakdown`
- `totalCosts`
- `netProfit`
- `netMarginPct`
- `costsApplied: true`

When no `costs` object is supplied, legacy behavior and decision thresholds remain unchanged and the new net fields are omitted except `costsApplied: false` if useful for explicit state.

When costs are supplied, decision strength must use `netMarginPct` rather than gross margin for profitability thresholds. Guardian and sold-evidence gates remain authoritative and unchanged.

Decision ordering remains:

1. Guardian/sold-evidence review or reject => `manual_review`
2. price materially above valuation or net margin below -10% => `avoid`
3. price above estimate => `overpriced`
4. strong-buy thresholds use net margin >= 35% when costs supplied
5. buy thresholds use net margin >= 20% when costs supplied
6. otherwise `fair`

The existing discount and confidence signals remain unchanged.

## Pipeline Integration

`valueItem(item, options)` accepts optional `options.costs` and forwards it unchanged to `evaluateOpportunity()` in both Guardian and non-Guardian paths. The pipeline does not compute fees itself.

## Security and Data Quality

- No hidden/default marketplace fee assumptions.
- No negative or non-finite cost values.
- No page-controlled cost inference.
- No remote calls in the cost engine.
- Guardian remains authoritative.
- Sold evidence remains distinct from asking evidence.
- UI code must not duplicate cost formulas.

## Compatibility

Calls that omit `costs` must preserve current opportunity decisions and gross outputs. Existing tests must remain green.

## Testing

Add focused tests for:

- exact cost summation and rounding
- each supported cost field
- missing fields as zero
- negative/non-finite cost rejection
- unknown cost fields ignored
- gross outputs preserved
- cost-aware decision downgrade when gross margin is strong but net margin is weak
- `strong_buy` allowed when net thresholds and existing sold/Guardian gates pass
- pipeline forwarding in Guardian and non-Guardian modes
- full regression suite
