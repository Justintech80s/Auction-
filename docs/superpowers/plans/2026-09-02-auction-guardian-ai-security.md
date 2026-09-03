# Auction Guardian + AI Security Implementation Plan

> Implementation follows test-driven development. Each production module must satisfy failing behavior tests before the phase is considered complete.

**Goal:** Implement the approved Guardian + AI Security architecture around Auction's existing evidence-backed valuation pipeline.

**Tech stack:** Node.js 20+, ES modules, built-in `node:test`, existing Auction valuation/intelligence/connectors.

## Task 1 — Guardian boundary

- [ ] Add failing tests for request validation, safe public errors, SSRF URL policy, rate limiting, deterministic risk scoring, and event redaction.
- [ ] Implement `src/security/gateway.js`.
- [ ] Implement `src/security/url-policy.js`.
- [ ] Implement `src/security/rate-limit.js`.
- [ ] Implement `src/security/risk-engine.js`.
- [ ] Implement `src/security/events.js`.

## Task 2 — AI safety layer

- [ ] Add failing tests for untrusted-evidence isolation, provider registry behavior, timeout/failure fallback, evidence citation validation, and deterministic-policy override protection.
- [ ] Implement `src/ai/provider-contract.js`.
- [ ] Implement `src/ai/provider-registry.js`.
- [ ] Implement `src/ai/security-brain.js`.

## Task 3 — Protected valuation pipeline

- [ ] Add failing integration tests for provenance, risk decisions, AI-disabled operation, manipulated sold-status evidence, and AI non-override behavior.
- [ ] Update `src/pipeline.js` to compose valuation + Guardian + optional AI.
- [ ] Preserve all existing valuation behavior.

## Task 4 — Connector hardening

- [ ] Add explicit eBay URL allowlist validation.
- [ ] Add request timeout handling and bounded limit validation.
- [ ] Stop leaking upstream response bodies in public connector errors.

## Task 5 — Secure development checks and docs

- [ ] Add CodeQL workflow.
- [ ] Update README and security documentation with implemented behavior only.
- [ ] Run the complete test suite.
- [ ] Verify GitHub Actions on the implementation branch.
- [ ] Open a pull request only after branch CI is green.
