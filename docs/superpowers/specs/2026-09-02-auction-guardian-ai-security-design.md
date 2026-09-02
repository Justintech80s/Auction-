# Auction Guardian + AI Security Architecture Design

Date: 2026-09-02
Status: Approved design

## Goal

Harden Auction's backend with a layered cybersecurity and AI-safety architecture inspired by the strongest patterns already used in KidOS and MovieFinder, while preserving Auction's working marketplace-comparable and valuation pipeline.

The design must keep deterministic market evidence authoritative, treat all external marketplace content as untrusted input, use AI as a controlled enrichment and risk-analysis layer, and fail safely when providers or upstream services are unavailable.

## Current Auction baseline

Auction currently has:

- marketplace connectors;
- comparable-search orchestration;
- item/comparable similarity scoring;
- sold-versus-asking classification;
- price normalization;
- comparable de-duplication;
- outlier removal;
- confidence scoring;
- weighted valuation estimates;
- an end-to-end valuation pipeline with passing CI.

These components remain the market-evidence foundation. The Guardian architecture will wrap and strengthen them rather than replace them.

## Security model

Auction will use defense in depth. No single AI model, upstream marketplace, request field, listing description, seller field, or external page is trusted by default.

Security decisions follow this authority order:

1. deterministic security policy;
2. validated and normalized marketplace evidence;
3. deterministic valuation logic;
4. AI risk and anomaly analysis;
5. AI explanation and enrichment.

AI must never silently override an explicit deterministic block, validated evidence rule, or valuation invariant.

## Architecture

### 1. Auction Guardian Gateway

Add a shared backend security boundary in `src/security/`.

Responsibilities:

- request and payload validation;
- maximum field/request sizes;
- method enforcement;
- safe error normalization;
- defensive response headers for HTTP surfaces;
- rate-limit interfaces;
- request identity abstraction that does not blindly trust client-controlled forwarding headers;
- normalized security context passed into downstream code.

The gateway must reject malformed or abusive inputs before marketplace or AI network calls occur.

### 2. Marketplace trust boundary

All marketplace connector data is untrusted until normalized.

Add explicit validation for:

- marketplace URLs and hostnames;
- source identifiers;
- listing titles and descriptions;
- prices and currencies;
- seller metadata;
- status values such as sold/active;
- timestamps;
- images and external media references;
- comparable identifiers.

Outbound network access must use allowlisted marketplace/provider domains where practical, bounded redirects, explicit timeouts, and response-size limits.

SSRF defenses must prevent arbitrary internal/private-network fetches. URL parsing must reject unsupported protocols, embedded credentials, malformed hosts, loopback/private/link-local targets, and unapproved redirect destinations.

### 3. Prompt-injection and untrusted-content isolation

Marketplace descriptions, seller text, image metadata, webpages, OCR-derived text, search snippets, and external model output are data, never instructions.

Before any content enters an AI request:

- label it as untrusted evidence;
- isolate it from system/developer instructions;
- enforce bounded length;
- remove or neutralize control-like wrappers where needed;
- pass only the minimum evidence required for the task.

AI responses must be parsed into a strict result contract. Free-form model output must not directly trigger network calls, filesystem operations, credential access, or security-policy changes.

### 4. Auction Risk Engine

Add `src/security/risk-engine.js` as a deterministic risk scorer.

Initial signal classes:

- implausible price relative to verified comparables;
- contradictory brand/model/category/year fields;
- duplicate or recycled listing identifiers;
- suspiciously repeated seller/listing patterns;
- manipulated or malformed sold-status evidence;
- abnormal comparable concentration from one source/seller;
- excessive disagreement between sold evidence and asking evidence;
- missing or weak provenance;
- suspicious URL/source characteristics;
- anomalous marketplace response structure.

The engine returns a structured result containing:

- `riskScore` from 0 to 1;
- `riskBand`: `low`, `medium`, `high`, or `critical`;
- `decision`: `allow`, `review`, or `reject`;
- machine-readable `signals`;
- concise deterministic `reasons`.

Critical deterministic signals can force `reject`. Medium/high uncertainty can force `review` even when valuation confidence is high.

### 5. AI Security Brain

Add an AI analysis abstraction under `src/ai/`.

The provider contract must support multiple providers without changing the rest of Auction. The initial design supports an OpenAI-compatible interface and keeps the registry extensible to providers such as Gemini, Anthropic, Ollama, or vLLM later.

AI tasks are narrow and typed:

- fraud/anomaly review;
- contradiction analysis;
- evidence summarization;
- explanation of opportunity/risk decisions;
- optional semantic comparable-quality enrichment.

AI outputs must include:

- structured classifications;
- confidence;
- cited evidence identifiers from the supplied evidence set;
- no hidden authority to change deterministic security decisions.

If AI is unavailable, times out, returns invalid JSON, exceeds cost/time budgets, or contradicts hard policy, Auction falls back to deterministic behavior and records the AI failure as an event.

### 6. Provider controls and fail-safe behavior

Provider configuration remains server-side.

Requirements:

- no API credentials committed to the repository;
- provider identities/endpoints locked by configuration;
- explicit request timeouts;
- bounded retries with no retry storms;
- circuit-breaker state for repeated provider failures;
- response-size limits;
- cost/token budgets per AI task;
- strict JSON/schema parsing;
- redaction of secrets and unnecessary user data from prompts/logs.

The core valuation pipeline must continue operating without AI.

### 7. Auction Security Event Ledger

Add a structured event subsystem inspired by KidOS Guardian events.

Each security-relevant event records fields such as:

- timestamp;
- request/action class;
- marketplace/source;
- normalized listing/source identifier where safe;
- decision;
- reason codes;
- risk score and risk band;
- valuation confidence band when applicable;
- AI provider/task status when applicable;
- correlation/request identifier.

The default implementation should use an injectable store interface so tests can use memory while production can later use a durable database/service without rewriting security logic.

Logs must avoid raw secrets, tokens, unnecessary PII, full upstream payloads, and unrestricted listing descriptions.

### 8. Valuation pipeline integration

The protected flow becomes:

`request -> Guardian Gateway -> marketplace connector -> trust-boundary normalization -> comparable ranking -> valuation -> deterministic Risk Engine -> optional AI Security Brain -> provenance verification -> opportunity result`

The existing valuation estimate remains authoritative for market value. The new security/risk layers add review/reject decisions and explanations; they do not rewrite historical evidence.

### 9. Provenance and evidence integrity

Every final result should be traceable to evidence.

Comparable records should preserve:

- source;
- source ID;
- normalized URL or source reference;
- evidence type (`sold` or `asking`);
- normalized price/currency;
- similarity score;
- inclusion/exclusion state;
- exclusion reason when removed as duplicate/outlier/invalid;
- risk signals associated with the comparable.

AI explanations may reference only evidence identifiers present in the validated evidence set.

### 10. Opportunity Engine interaction

The previously proposed opportunity layer will consume both valuation and security output.

A listing cannot receive a `strong_buy` recommendation when Guardian returns `reject` or `review` for a high-risk integrity issue. Opportunity scoring must therefore be confidence-adjusted and risk-adjusted.

The final decision surface can include:

- fair-value estimate and range;
- valuation confidence;
- current purchase price;
- discount/premium percentage;
- estimated resale margin;
- opportunity score;
- risk score and risk band;
- `strong_buy`, `buy`, `fair`, `overpriced`, `avoid`, or `manual_review` classification;
- deterministic reasons;
- optional AI explanation.

### 11. CI and secure development checks

Extend GitHub Actions with security-focused regression coverage.

Required test classes:

- malformed and oversized input rejection;
- method/security-header behavior for HTTP surfaces;
- rate-limit exhaustion;
- SSRF/private-network URL rejection;
- redirect abuse rejection;
- timeout behavior;
- upstream response-size handling;
- prompt-injection payload isolation;
- invalid/hostile AI output parsing;
- AI timeout/provider-failure fallback;
- poisoned comparable data;
- fake sold-status patterns;
- duplicate/recycled comparable manipulation;
- extreme-price and outlier attacks;
- deterministic hard-policy override protection;
- no secret/internal-error leakage;
- security-event redaction;
- existing valuation tests remain green.

Add GitHub-native static/code security analysis such as CodeQL where compatible with the repository.

## Component boundaries

### `src/security/gateway.js`
Request validation, method/security boundary, common safe errors, and security context.

### `src/security/url-policy.js`
Marketplace/provider URL validation, allowlisting, SSRF/private-address protections, redirect policy.

### `src/security/rate-limit.js`
Injectable limiter interface and baseline implementation.

### `src/security/risk-engine.js`
Deterministic anomaly/risk signals and allow/review/reject decision.

### `src/security/events.js`
Security-event contract, redaction, and injectable event-store interface.

### `src/ai/provider-contract.js`
Typed provider interface and common timeout/schema/error handling.

### `src/ai/provider-registry.js`
Provider selection without exposing credentials to callers.

### `src/ai/security-brain.js`
Narrow AI tasks for anomaly review and explanation, never hard-policy authority.

### Existing `src/intelligence.js`
Continues comparable similarity/ranking responsibilities.

### Existing `src/valuation.js`
Continues deterministic price normalization, evidence weighting, outlier filtering, confidence, and valuation responsibilities.

### Existing `src/pipeline.js`
Becomes the orchestrator that composes Guardian, evidence, valuation, risk, optional AI, and final result.

## Error handling

Errors are categorized into stable public/internal classes:

- invalid input;
- blocked security policy;
- upstream marketplace timeout/failure;
- upstream malformed response;
- AI unavailable/timeout/invalid output;
- insufficient evidence;
- internal failure.

Public errors must be concise and must not expose stack traces, secrets, raw upstream payloads, model prompts, environment variables, or internal network details.

Security-critical failures must fail closed where proceeding could create unsafe network access or corrupted evidence. AI-only failures fail open to the deterministic valuation path, while clearly recording that AI enrichment was unavailable.

## Testing strategy

Implementation uses TDD. Each component receives focused unit tests before integration changes. Pipeline integration tests verify both normal and adversarial behavior.

Security tests must not depend on live external marketplaces or live model providers. Connector/provider interfaces should be injectable so deterministic fake responses can test malicious and failure scenarios.

Existing Auction tests remain part of the acceptance gate.

## Non-goals for this phase

- Building offensive security or exploitation capabilities.
- Letting an LLM autonomously execute arbitrary tools or network requests.
- Replacing Auction's deterministic valuation engine with an LLM.
- Claiming AI can prove fraud from weak evidence.
- Building a full identity/KYC/payment system before Auction has product requirements for those features.
- Migrating the entire codebase to another language or framework solely for perceived sophistication.
- Copying KidOS child-safety controls that are unrelated to Auction's threat model.

## Success criteria

The architecture is successful when:

1. malformed, abusive, or unsafe requests are rejected before expensive external work;
2. marketplace/network access is bounded and protected against SSRF-style abuse;
3. untrusted listing content cannot become AI instructions;
4. deterministic valuation remains functional with AI completely disabled;
5. suspicious evidence can trigger review/reject decisions with explainable reasons;
6. AI analysis is typed, bounded, provider-abstracted, and unable to override hard security policy;
7. every important valuation/risk decision has traceable provenance;
8. security events are structured and privacy-conscious;
9. adversarial regression tests and existing valuation tests pass in CI;
10. the design leaves clean extension points for stronger distributed rate limiting, durable event storage, additional AI providers, and future fraud models without rewriting core Auction logic.
