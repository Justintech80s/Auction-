import { validateOutboundUrl } from '../security/url-policy.js';

const EBAY_BROWSE_SEARCH_URL = 'https://api.ebay.com/buy/browse/v1/item_summary/search';
const EBAY_ALLOWED_HOSTS = ['api.ebay.com'];

export async function searchEbay(query, options = {}) {
  const accessToken = options.accessToken || process.env.EBAY_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error('EBAY_ACCESS_TOKEN is required to search eBay');
  }

  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('A fetch implementation is required');
  }

  const url = validateOutboundUrl(EBAY_BROWSE_SEARCH_URL, EBAY_ALLOWED_HOSTS);
  url.searchParams.set('q', String(query || '').trim().slice(0, 512));
  const requestedLimit = Number(options.limit || 20);
  const limit = Math.max(1, Math.min(100, Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : 20));
  url.searchParams.set('limit', String(limit));

  const controller = new AbortController();
  const timeoutMs = Math.max(1, Math.min(30_000, Number(options.timeoutMs || 5000)));
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetchImpl(url, {
      signal: controller.signal,
      redirect: 'error',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-EBAY-C-MARKETPLACE-ID': options.marketplaceId || 'EBAY_US'
      }
    });
  } catch (error) {
    if (controller.signal.aborted) throw new Error('eBay Browse API request timed out');
    throw new Error('eBay Browse API request failed');
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new Error(`eBay Browse API request failed (${response.status})`);
  }

  const payload = await response.json();
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.itemSummaries || [])) {
    throw new Error('eBay Browse API returned a malformed response');
  }

  return (payload.itemSummaries || []).slice(0, limit).flatMap((item) => {
    if (!item?.itemId || !item?.price?.value || !item?.price?.currency) return [];
    return [{
      source: 'ebay',
      sourceId: String(item.itemId).slice(0, 256),
      title: String(item.title || '').slice(0, 512),
      url: String(item.itemWebUrl || '').slice(0, 2048),
      price: item.price.value,
      currency: String(item.price.currency).slice(0, 8),
      condition: item.condition ? String(item.condition).slice(0, 128) : null,
      status: 'active',
      evidenceType: 'asking'
    }];
  });
}
