# End-to-End Valuation Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect Auction's item-query intelligence, marketplace connector layer, comparable ranking, and valuation engine into one deterministic end-to-end valuation function.

**Architecture:** Add a small orchestration module that accepts structured item attributes, builds a marketplace query, calls a selected connector, ranks returned listings, filters weak matches, and passes the evidence into the existing valuation engine. Keep connectors injectable so tests never require real credentials or network access.

**Tech Stack:** Node.js 20+, ES modules, built-in node:test, existing Auction valuation/intelligence/connectors modules.

**Spec:** Existing repository architecture and current implemented modules.

## Global Constraints

- Preserve the current public valuation behavior.
- Do not commit marketplace credentials.
- Tests must remain deterministic and network-free.
- Active marketplace listings remain asking-price evidence.
- Weak evidence must return insufficient_evidence rather than fabricated precision.

---

### Task 1: Pipeline contract

**Files:**
- Create: `test/pipeline.test.js`
- Create: `src/pipeline.js`

**Interfaces:**
- Consumes: `buildSearchQuery(item)`, `rankComparables(item, comparables)`, `estimateValue(comparables)`, marketplace search function.
- Produces: `valueItem(item, options)` returning query, source, evidence summary, ranked comparables, and valuation result.

- [ ] Write failing tests for query construction, connector invocation, ranking, weak-match filtering, and valuation output.
- [ ] Verify tests fail because `src/pipeline.js` does not exist.
- [ ] Implement minimal orchestration.
- [ ] Run full test suite and verify green.

### Task 2: Documentation and verification

**Files:**
- Modify: `README.md`

- [ ] Document the end-to-end pipeline API.
- [ ] Verify committed source exists on GitHub.
- [ ] Verify the latest GitHub Actions workflow conclusion before claiming CI success.
