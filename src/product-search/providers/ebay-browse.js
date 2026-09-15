const TOKEN_URL = 'https://api.ebay.com/identity/v1/oauth2/token';
const SEARCH_URL = 'https://api.ebay.com/buy/browse/v1/item_summary/search';
const DEFAULT_SCOPE = 'https://api.ebay.com/oauth/api_scope';
const MARKETPLACE = 'EBAY_US';

function requiredText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new TypeError(`${label} credentials are required`);
  return text;
}

function safeHttps(value) {
  try {
    const url = new URL(String(value ?? ''));
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function buildQuery(identity = {}) {
  const pieces = [identity.brand, identity.model, identity.title]
    .map(value => String(value ?? '').trim())
    .filter(Boolean);
  const unique = [];
  const seen = new Set();
  for (const piece of pieces) {
    const key = piece.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(piece);
  }
  return unique.join(' ').slice(0, 300) || 'product';
}

function shippingFrom(summary) {
  const value = summary?.shippingOptions?.[0]?.shippingCost?.value;
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function mapSummary(summary) {
  const currency = String(summary?.price?.currency ?? '').toUpperCase();
  const itemPrice = Number(summary?.price?.value);
  const url = safeHttps(summary?.itemWebUrl);
  if (!summary?.itemId || !summary?.title || currency !== 'USD' || !Number.isFinite(itemPrice) || itemPrice <= 0 || !url) {
    return null;
  }

  return {
    source: 'ebay',
    sourceId: String(summary.itemId).slice(0, 256),
    store: 'eBay',
    title: String(summary.title).trim().slice(0, 512),
    url,
    imageUrl: safeHttps(summary?.image?.imageUrl),
    brand: null,
    model: null,
    category: null,
    identifiers: {},
    specs: {},
    condition: summary?.condition ? String(summary.condition).slice(0, 64) : null,
    itemPrice,
    shipping: shippingFrom(summary),
    currency: 'USD',
    availability: 'in_stock',
    sourceConfidence: 0.9
  };
}

async function readJson(response, label) {
  if (!response?.ok) throw new Error(`${label}_unavailable`);
  try {
    return await response.json();
  } catch {
    throw new Error(`${label}_invalid_response`);
  }
}

export function createEbayBrowseProvider({
  clientId,
  clientSecret,
  fetchImpl = globalThis.fetch,
  scope = DEFAULT_SCOPE
} = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch implementation is required');
  const id = String(clientId ?? '').trim();
  const secret = String(clientSecret ?? '').trim();
  let cachedToken = null;
  let expiresAt = 0;

  async function accessToken() {
    requiredText(id, 'eBay');
    requiredText(secret, 'eBay');
    if (cachedToken && Date.now() < expiresAt - 60_000) return cachedToken;

    const basic = Buffer.from(`${id}:${secret}`, 'utf8').toString('base64');
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      scope
    });
    const response = await fetchImpl(TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString()
    });
    const data = await readJson(response, 'ebay_oauth');
    const token = String(data?.access_token ?? '').trim();
    if (!token) throw new Error('ebay_oauth_invalid_response');
    const expiresIn = Math.max(60, Math.min(7200, Number(data?.expires_in) || 7200));
    cachedToken = token;
    expiresAt = Date.now() + expiresIn * 1000;
    return token;
  }

  return Object.freeze({
    name: 'ebay',
    trustTier: 'trusted',
    async searchOffers(identity = {}, { limit = 30 } = {}) {
      const token = await accessToken();
      const boundedLimit = Math.max(1, Math.min(30, Number(limit) || 30));
      const url = new URL(SEARCH_URL);
      url.searchParams.set('q', buildQuery(identity));
      url.searchParams.set('limit', String(boundedLimit));

      const response = await fetchImpl(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-EBAY-C-MARKETPLACE-ID': MARKETPLACE,
          Accept: 'application/json'
        }
      });
      const data = await readJson(response, 'ebay_browse');
      const summaries = Array.isArray(data?.itemSummaries) ? data.itemSummaries : [];
      return summaries.slice(0, boundedLimit).map(mapSummary).filter(Boolean);
    }
  });
}
