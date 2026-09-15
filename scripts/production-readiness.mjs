const ALLOWED_STATUSES = new Set(['complete', 'partial_results', 'needs_confirmation', 'no_results', 'provider_unavailable', 'error']);

function requireHttps(value) {
  let url;
  try {
    url = new URL(String(value || ''));
  } catch {
    throw new TypeError('endpoint must be a valid URL');
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new TypeError('endpoint must be credential-free https');
  }
  url.hash = '';
  return url;
}

export function validateProductionConfig({ endpoint } = {}) {
  const url = requireHttps(endpoint);
  if (url.pathname !== '/api/product-scan') {
    throw new TypeError('endpoint must use /api/product-scan');
  }
  return Object.freeze({ endpoint: url.toString() });
}

function safeMerchantUrl(value) {
  if (value == null) return null;
  return requireHttps(value).toString();
}

export function validateProductionScanResult(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('scan result must be an object');
  }
  if (!ALLOWED_STATUSES.has(input.status)) throw new TypeError('invalid scan status');
  if (!input.identifiedProduct || typeof input.identifiedProduct.title !== 'string' || !input.identifiedProduct.title.trim()) {
    if (input.status !== 'needs_confirmation') throw new TypeError('identified product is required');
  }
  if (!Array.isArray(input.priceComparison)) throw new TypeError('priceComparison must be an array');
  if (!Array.isArray(input.providerErrors)) throw new TypeError('providerErrors must be an array');
  if (input.lowestPrice) safeMerchantUrl(input.lowestPrice.url);
  for (const offer of input.priceComparison) {
    if (offer?.url) safeMerchantUrl(offer.url);
    if (offer?.guardianDecision === 'reject' && input.lowestPrice?.url === offer.url) {
      throw new TypeError('rejected offer cannot be lowest price');
    }
  }
  return input;
}

export async function verifyProductionEndpoint({ endpoint, fetchImpl = globalThis.fetch } = {}) {
  const config = validateProductionConfig({ endpoint });
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch implementation is required');

  const response = await fetchImpl(config.endpoint, {
    method: 'POST',
    redirect: 'error',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      action: 'product_scan',
      source: 'production_smoke_test',
      evidence: {
        title: 'Dell Latitude 7420',
        brand: 'Dell',
        model: 'Latitude 7420',
        category: 'Laptop',
        condition: 'used',
        specs: { ram: '16GB', storage: '512GB SSD' },
        sourceUrl: 'https://example.com/auction-smoke-test',
        imageUrl: 'https://example.com/auction-smoke-test.jpg',
        confidence: 0.95
      }
    })
  });

  if (!response?.ok || typeof response.json !== 'function') {
    throw new Error(`production endpoint returned HTTP ${response?.status ?? 'unknown'}`);
  }
  const result = validateProductionScanResult(await response.json());
  return Object.freeze({
    ok: true,
    endpoint: config.endpoint,
    status: result.status,
    providerConnected: result.status === 'complete' || result.status === 'partial_results',
    offerCount: result.priceComparison.length
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const endpoint = process.argv[2] || process.env.AUCTION_PRODUCT_SCAN_ENDPOINT;
  try {
    const summary = await verifyProductionEndpoint({ endpoint });
    console.log(JSON.stringify(summary, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
