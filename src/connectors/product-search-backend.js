import {
  normalizeCondition,
  normalizeOffer,
  normalizeProductIdentity,
  normalizeScanEvidence
} from '../product-search/contracts.js';

const SHARED_STATUSES = new Set([
  'complete',
  'partial_results',
  'needs_confirmation',
  'no_results',
  'provider_unavailable',
  'error'
]);

function requireHttpsEndpoint(value) {
  let url;
  try {
    url = new URL(String(value || ''));
  } catch {
    throw new TypeError('backend endpoint must be a valid https URL');
  }
  if (url.protocol !== 'https:') {
    throw new TypeError('backend endpoint must use https');
  }
  if (url.username || url.password) {
    throw new TypeError('backend endpoint must not contain credentials');
  }
  url.hash = '';
  return url.toString();
}

function safeFailure() {
  return new Error('product_search_backend_unavailable');
}

function boundedString(value, max, { required = false } = {}) {
  const text = value == null ? '' : String(value).trim().replace(/\s+/g, ' ');
  if (!text) {
    if (required) throw safeFailure();
    return null;
  }
  if (text.length > max) throw safeFailure();
  return text;
}

function boundedArray(value, maxEntries, maxLength) {
  if (value == null) return Object.freeze([]);
  if (!Array.isArray(value) || value.length > maxEntries) throw safeFailure();
  return Object.freeze(value.map(entry => boundedString(entry, maxLength, { required: true })));
}

function finiteAmount(value, { positive = false, nullable = false } = {}) {
  if (value == null && nullable) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || (positive ? number <= 0 : number < 0)) throw safeFailure();
  return Math.round(number * 100) / 100;
}

function confidence(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1) throw safeFailure();
  return number;
}

function safeHttpsUrl(value, { required = false } = {}) {
  if (value == null || value === '') {
    if (required) throw safeFailure();
    return null;
  }
  try {
    const url = new URL(String(value));
    if (url.protocol !== 'https:' || url.username || url.password) throw safeFailure();
    url.hash = '';
    return url.toString();
  } catch {
    if (required) throw safeFailure();
    return null;
  }
}

function normalizeProviderErrors(value) {
  if (value == null) return Object.freeze([]);
  if (!Array.isArray(value) || value.length > 20) throw safeFailure();
  return Object.freeze(value.map(entry => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw safeFailure();
    return Object.freeze({
      source: boundedString(entry.source, 64, { required: true }),
      code: boundedString(entry.code, 64, { required: true })
    });
  }));
}

function normalizeIdentifiedProduct(value) {
  if (value == null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw safeFailure();
  return Object.freeze({
    title: boundedString(value.title, 512, { required: true }),
    brand: boundedString(value.brand, 128),
    model: boundedString(value.model, 128),
    features: boundedArray(value.features, 16, 160),
    imageUrl: safeHttpsUrl(value.imageUrl),
    confidence: confidence(value.confidence ?? 0)
  });
}

function normalizeSharedOffer(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw safeFailure();
  const url = safeHttpsUrl(value.url);
  if (!url) return null;
  const price = finiteAmount(value.price, { positive: true });
  const shipping = finiteAmount(value.shipping, { nullable: true });
  const estimatedTotal = value.estimatedTotal == null
    ? (shipping == null ? null : Math.round((price + shipping) * 100) / 100)
    : finiteAmount(value.estimatedTotal);
  const currency = boundedString(value.currency, 3, { required: true }).toUpperCase();
  if (currency !== 'USD') throw safeFailure();
  const guardianDecision = boundedString(value.guardianDecision, 16);
  if (guardianDecision && !['allow', 'review', 'reject'].includes(guardianDecision)) throw safeFailure();

  return Object.freeze({
    store: boundedString(value.store, 128, { required: true }),
    title: boundedString(value.title, 512, { required: true }),
    price,
    currency,
    shipping,
    estimatedTotal,
    condition: normalizeCondition(value.condition),
    description: boundedString(value.description, 512),
    url,
    imageUrl: safeHttpsUrl(value.imageUrl),
    matchConfidence: value.matchConfidence == null ? null : confidence(value.matchConfidence),
    guardianDecision: guardianDecision ?? null
  });
}

function normalizeLowestPrice(value, offers) {
  if (value == null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw safeFailure();
  const url = safeHttpsUrl(value.url);
  if (!url) return null;
  const amount = finiteAmount(value.amount, { positive: true });
  const shipping = finiteAmount(value.shipping, { nullable: true });
  const estimatedTotal = value.estimatedTotal == null
    ? (shipping == null ? null : Math.round((amount + shipping) * 100) / 100)
    : finiteAmount(value.estimatedTotal);
  const currency = boundedString(value.currency, 3, { required: true }).toUpperCase();
  if (currency !== 'USD') throw safeFailure();

  const matchingOffer = offers.find(offer => offer.url === url && offer.store === String(value.store || '').trim());
  if (matchingOffer?.guardianDecision === 'reject') return null;

  return Object.freeze({
    amount,
    currency,
    store: boundedString(value.store, 128, { required: true }),
    url,
    shipping,
    estimatedTotal,
    condition: normalizeCondition(value.condition)
  });
}

function normalizeSharedResult(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw safeFailure();
  const status = boundedString(value.status, 32, { required: true });
  if (!SHARED_STATUSES.has(status)) throw safeFailure();

  if (!Array.isArray(value.priceComparison)) throw safeFailure();
  if (value.priceComparison.length > 60) throw safeFailure();
  const priceComparison = Object.freeze(value.priceComparison
    .map(normalizeSharedOffer)
    .filter(Boolean));

  const currentPagePrice = value.currentPagePrice == null ? null : Object.freeze({
    amount: finiteAmount(value.currentPagePrice.amount, { positive: true }),
    currency: boundedString(value.currentPagePrice.currency, 3, { required: true }).toUpperCase()
  });
  if (currentPagePrice && currentPagePrice.currency !== 'USD') throw safeFailure();
  const savings = value.savings == null ? null : Object.freeze({
    amount: finiteAmount(value.savings.amount, { positive: true }),
    currency: boundedString(value.savings.currency, 3, { required: true }).toUpperCase()
  });
  if (savings && savings.currency !== 'USD') throw safeFailure();

  return Object.freeze({
    status,
    identifiedProduct: normalizeIdentifiedProduct(value.identifiedProduct),
    currentPagePrice,
    lowestPrice: normalizeLowestPrice(value.lowestPrice, priceComparison),
    savings,
    priceComparison,
    savingsTips: boundedArray(value.savingsTips, 12, 320),
    providerErrors: normalizeProviderErrors(value.providerErrors)
  });
}

export function createProductSearchBackend({
  endpoint,
  fetchImpl = globalThis.fetch,
  timeoutMs = 5000
} = {}) {
  const endpointUrl = requireHttpsEndpoint(endpoint);
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch implementation is required');

  const boundedTimeout = Math.max(1, Math.min(30_000, Number(timeoutMs) || 5000));

  async function post(payload) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), boundedTimeout);
    try {
      const response = await fetchImpl(endpointUrl, {
        method: 'POST',
        redirect: 'error',
        signal: controller.signal,
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      if (!response?.ok || typeof response.json !== 'function') throw safeFailure();
      const body = await response.json();
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw safeFailure();
      return body;
    } catch {
      throw safeFailure();
    } finally {
      clearTimeout(timer);
    }
  }

  return Object.freeze({
    name: 'product-search-backend',
    trustTier: 'broad',
    async scanProduct(input) {
      try {
        const evidence = normalizeScanEvidence(input, { now: input?.capturedAt });
        const result = await post({
          action: 'product_scan',
          source: 'browser_extension',
          evidence
        });
        return normalizeSharedResult(result);
      } catch {
        throw safeFailure();
      }
    },
    async identifyProduct(input) {
      try {
        const evidence = normalizeScanEvidence(input, { now: input?.capturedAt });
        const result = await post({ action: 'identify_product', evidence });
        if (result.status !== 'identified' || !result.identity) throw safeFailure();
        return normalizeProductIdentity(result.identity, {
          now: result.identity.capturedAt ?? evidence.capturedAt
        });
      } catch {
        throw safeFailure();
      }
    },
    async searchOffers(input) {
      try {
        const identity = normalizeProductIdentity(input, { now: input?.capturedAt });
        const result = await post({ action: 'search_offers', identity });
        if (!Array.isArray(result.offers)) throw safeFailure();
        return Object.freeze(result.offers.slice(0, 60).map(offer => normalizeOffer(offer)));
      } catch {
        throw safeFailure();
      }
    }
  });
}
