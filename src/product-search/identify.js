import {
  normalizeProductIdentity,
  normalizeScanEvidence
} from './contracts.js';

function hasStrongIdentifier(evidence) {
  return Boolean(evidence.model) || Object.keys(evidence.identifiers || {}).length > 0;
}

function identityFromEvidence(evidence) {
  return normalizeProductIdentity({
    title: evidence.title || evidence.pageTitle,
    brand: evidence.brand,
    model: evidence.model,
    category: evidence.category,
    condition: evidence.condition,
    identifiers: evidence.identifiers,
    specs: evidence.specs,
    sourceUrl: evidence.sourceUrl,
    imageUrl: evidence.imageUrl,
    confidence: evidence.confidence,
    capturedAt: evidence.capturedAt
  }, { now: evidence.capturedAt });
}

export async function identifyProduct(input, { visualProvider } = {}) {
  const evidence = normalizeScanEvidence(input, { now: input?.capturedAt });

  if (evidence.confidence >= 0.75 && hasStrongIdentifier(evidence)) {
    return Object.freeze({
      status: 'identified',
      identity: identityFromEvidence(evidence)
    });
  }

  if (!evidence.imageUrl || typeof visualProvider?.identifyProduct !== 'function') {
    return Object.freeze({
      status: 'needs_confirmation',
      identity: null
    });
  }

  try {
    const providerResult = await visualProvider.identifyProduct(evidence);
    if (!providerResult || typeof providerResult !== 'object' || Array.isArray(providerResult)) {
      return Object.freeze({ status: 'needs_confirmation', identity: null });
    }

    const identity = normalizeProductIdentity({
      title: providerResult.title || evidence.title || evidence.pageTitle,
      brand: providerResult.brand ?? evidence.brand,
      model: providerResult.model ?? evidence.model,
      category: providerResult.category ?? evidence.category,
      condition: providerResult.condition ?? evidence.condition,
      identifiers: providerResult.identifiers ?? evidence.identifiers,
      specs: providerResult.specs ?? evidence.specs,
      sourceUrl: evidence.sourceUrl,
      imageUrl: evidence.imageUrl,
      confidence: providerResult.confidence ?? 0,
      capturedAt: evidence.capturedAt
    }, { now: evidence.capturedAt });

    if (identity.confidence < 0.75 || !hasStrongIdentifier(identity)) {
      return Object.freeze({ status: 'needs_confirmation', identity });
    }

    return Object.freeze({ status: 'identified', identity });
  } catch {
    return Object.freeze({
      status: 'needs_confirmation',
      identity: null
    });
  }
}
