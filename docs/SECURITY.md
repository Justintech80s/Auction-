# Security and Privacy

Auction uses a defense-in-depth backend security model. Marketplace data, user-controlled fields, and AI output are treated as untrusted input.

## Implemented Guardian Controls

The protected valuation path includes:

- bounded request-field validation
- method enforcement helpers and safe public-error normalization
- outbound HTTPS host allowlisting
- private, loopback, link-local, credential-bearing, and unapproved URL rejection
- bounded redirect-chain validation helpers
- injectable in-memory rate limiting for deterministic testing and single-process deployments
- deterministic anomaly/risk scoring with `allow`, `review`, and `reject` decisions
- privacy-conscious structured security events
- provenance records for accepted comparables

Security-critical deterministic decisions are authoritative. AI output cannot silently override them.

## Marketplace Connector Security

The eBay connector uses the fixed official Browse API host and validates that destination against Auction's outbound URL policy. Requests include:

- an explicit abort timeout
- redirect blocking
- bounded query and result limits
- safe upstream error messages that do not include raw response bodies
- bounded normalized output fields

Marketplace listing text, URLs, status fields, identifiers, prices, and metadata remain untrusted evidence after transport and are evaluated by the rest of the pipeline.

## AI Security Brain

AI enrichment is optional. The core valuation and deterministic risk pipeline does not require an AI provider.

When enabled, AI analysis is constrained by:

- an injectable provider contract
- explicit timeout handling
- strict output validation
- bounded untrusted evidence fields
- evidence-ID allowlisting so generated citations cannot introduce unknown evidence
- deterministic-policy non-override behavior
- safe fallback when the provider fails, times out, or returns invalid output

AI output is advisory enrichment. It is not proof of fraud and is not an authority to execute tools, access credentials, change policy, or rewrite marketplace evidence.

## Secrets

API keys, marketplace credentials, AI-provider tokens, private endpoints, and other credentials must not be committed to this repository. Public source should reference environment variables or a managed secret store.

## User Uploads

Uploaded item images and user-provided files may contain personal or identifying information. Production handling should apply file-type validation, size limits, controlled storage, access restrictions, and a documented retention/deletion policy before uploads are connected to the public backend.

## External Data

Marketplace integrations should use legitimate APIs, permitted public data, or other authorized access methods. Source-specific usage restrictions and rate limits must be respected.

## Input Safety

File metadata, filenames, listing text, URLs, seller fields, and model-generated attributes are untrusted input. Processing layers validate expected types and avoid constructing executable commands from user-controlled strings.

## Provenance

Valuation evidence retains source identifiers so results can be audited. AI-generated interpretations do not overwrite source evidence and must not be presented as verified marketplace facts.

## Security Events

The in-memory event implementation is injectable so production can later use a durable store without rewriting the security model. Event redaction removes common secret-bearing keys and bounds raw text before storage.

## Secure Development

The repository runs deterministic tests in GitHub Actions and includes a CodeQL workflow for JavaScript/TypeScript analysis. Security regression tests cover Guardian validation, SSRF-style URL blocking, rate limits, risk scoring, event redaction, AI failure/timeout fallback, AI non-override behavior, evidence citation validation, and hardened eBay connector behavior.

## Production Follow-ups

Before treating the system as production-ready, add deployment-specific controls such as a distributed rate limiter, durable event/observability storage, production secret management, upload scanning/retention controls, and environment-specific network egress policy.
