# Net Profit Cost Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add explicit cost modeling so Auction reports net profit/margin and uses net economics for buy-strength decisions when costs are supplied.

**Architecture:** Add an isolated deterministic cost engine under `src/costs/`. Opportunity imports it and remains the decision authority. Pipeline only forwards `options.costs`; browser/UI layers do not duplicate cost calculations.

**Tech Stack:** Node.js 20+, ES modules, `node:test`, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-12-net-profit-cost-engine-design.md`

## Global Constraints

- Costs are explicit caller-supplied values only; do not infer marketplace fees.
- Supported fields: marketplaceFee, shipping, tax, repairs, paymentProcessing, holding.
- Supplied costs must be finite and non-negative.
- Existing gross fields remain backward compatible.
- When costs are absent, existing opportunity decisions must not change.
- When costs are supplied, profitability thresholds use net margin.
- Guardian and sold-evidence gates remain authoritative.
- No new network calls or browser permissions.

---

### Task 1: Deterministic Cost Engine

**Files:**
- Create: `src/costs/engine.js`
- Create: `test/cost-engine.test.js`

**Interfaces:**
- Produces: `calculateNetEconomics({ acquisitionPrice, estimatedValue, costs })`

- [ ] **Step 1: Write failing tests** for exact totals, rounding, missing fields, unknown fields, and invalid negative/non-finite costs.
- [ ] **Step 2: Run `node --test test/cost-engine.test.js`** and confirm RED because the module does not exist.
- [ ] **Step 3: Implement the minimal deterministic engine** with strict validation and a six-field allowlist.
- [ ] **Step 4: Run `node --test test/cost-engine.test.js`** and confirm GREEN.
- [ ] **Step 5: Commit** with `feat: add net profit cost engine`.

### Task 2: Cost-Aware Opportunity Decisions

**Files:**
- Modify: `src/opportunity.js`
- Modify: `test/opportunity-engine.test.js`

**Interfaces:**
- Consumes: `calculateNetEconomics(...)`
- Produces: existing opportunity result plus `costsApplied`, `costBreakdown`, `totalCosts`, `netProfit`, and `netMarginPct` when costs are supplied.

- [ ] **Step 1: Add failing tests** proving gross outputs remain unchanged and a grossly attractive deal can downgrade when explicit costs reduce net margin.
- [ ] **Step 2: Run the focused opportunity tests** and confirm RED.
- [ ] **Step 3: Integrate the cost engine** while preserving Guardian/sold-evidence decision precedence.
- [ ] **Step 4: Run focused cost/opportunity tests** and confirm GREEN.
- [ ] **Step 5: Commit** with `feat: use net economics for opportunity decisions`.

### Task 3: Pipeline Cost Forwarding

**Files:**
- Modify: `src/pipeline.js`
- Modify: `test/opportunity-pipeline.test.js`

**Interfaces:**
- Consumes: `options.costs`
- Produces: pipeline opportunity results containing net economics when explicit costs are provided.

- [ ] **Step 1: Add failing tests** for cost forwarding through Guardian and non-Guardian opportunity paths.
- [ ] **Step 2: Run `node --test test/opportunity-pipeline.test.js`** and confirm RED.
- [ ] **Step 3: Pass `costs: options.costs`** into both `evaluateOpportunity()` calls.
- [ ] **Step 4: Run focused pipeline tests** and confirm GREEN.
- [ ] **Step 5: Commit** with `feat: forward explicit costs through valuation pipeline`.

### Task 4: Regression and Release Verification

**Files:**
- No production file required unless regression fixes are necessary.

- [ ] **Step 1: Run `npm test`** and require zero failures.
- [ ] **Step 2: Run `npm run build:extension`** and require success, proving the new shared code remains packageable.
- [ ] **Step 3: Verify the exact GitHub Actions run for the final branch head** has successful tests/build.
- [ ] **Step 4: Review diff for permission creep, duplicated formulas, hidden fee defaults, or Guardian bypasses.**
- [ ] **Step 5: Prepare a PR to `main` only after all verification gates are green.**
