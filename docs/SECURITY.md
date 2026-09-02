# Security and Privacy Direction

## Secrets

API keys, marketplace credentials, tokens, private endpoints, and other credentials must not be committed to this repository. Public source should reference environment variables or a managed secret store.

## User Uploads

Uploaded item images and user-provided files may contain personal or identifying information. Production handling should apply file-type validation, size limits, controlled storage, access restrictions, and a documented retention/deletion policy.

## External Data

Marketplace integrations should use legitimate APIs, permitted public data, or other authorized access methods. Source-specific usage restrictions and rate limits should be respected.

## Input Safety

File metadata, filenames, listing text, URLs, and model-generated attributes should be treated as untrusted input. Processing layers should validate expected types and avoid constructing executable commands from user-controlled strings.

## Provenance

Valuation evidence should retain its source so results can be audited. AI-generated interpretations should not overwrite source evidence or be presented as verified marketplace facts.

## Repository Publication

Before Base44 source is mirrored publicly:

1. inspect configuration and environment references
2. remove credentials and private data
3. ensure generated/uploaded user content is excluded
4. add an appropriate `.gitignore`
5. document required environment variables using placeholders only
6. run secret scanning before publication

This document describes the security standard for the project; it does not claim that unavailable Base44 source has already undergone these checks.
