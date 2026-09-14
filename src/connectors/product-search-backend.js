import {
  normalizeOffer,
  normalizeProductIdentity,
  normalizeScanEvidence
} from '../product-search/contracts.js';

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
