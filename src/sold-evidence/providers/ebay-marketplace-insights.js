import { validateOutboundUrl } from '../../security/url-policy.js';
import { normalizeSoldRecord } from '../normalize.js';

const MARKETPLACE_INSIGHTS_URL = 'https://api.ebay.com/buy/marketplace_insights/v1_beta/item_sales/search';
const ALLOWED_HOSTS = ['api.ebay.com'];
const MAX_QUERY_LENGTH = 512;
const MAX_RESULTS = 200;
const MAX_TIMEOUT_MS = 30_000;

function boundedPositiveInteger(value, fallback, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(max, Math.floor(parsed));
}

function normalizeCategoryIds(value) {
  const categories = Array.isArray(value) ? value : [];
  const normalized = categories
    .map((categoryId) => String(categoryId ?? '').trim())
    .filter(Boolean)
    .slice(0, 4);

  if (!normalized.length) {
    throw new Error('categoryIds is required for eBay Marketplace Insights search');
  }

  return normalized;
}

function createSearchUrl(query, options) {
  const url = validateOutboundUrl(MARKETPLACE_INSIGHTS_URL, ALLOWED_HOSTS);
  const normalizedQuery = String(query ?? '').trim().slice(0, MAX_QUERY_LENGTH);
  const categoryIds = normalizeCategoryIds(options.categoryIds);
  const limit = boundedPositiveInteger(options.limit, 20, MAX_RESULTS);

  if (normalizedQuery) url.searchParams.set('q', normalizedQuery);
  url.searchParams.set('category_ids', categoryIds.join(','));
  url.searchParams.set('limit', String(limit));
  return url;
}

function normalizeItemSale(item, now) {
  if (!item?.itemId || !item?.lastSoldPrice?.value || !item?.lastSoldPrice?.currency || !item?.lastSoldDate) {
    return null;
  }

  return normalizeSoldRecord({
    source: 'ebay_marketplace_insights',
    sourceId: item.itemId,
    title: item.title,
    soldPrice: item.lastSoldPrice.value,
    currency: item.lastSoldPrice.currency,
    soldAt: item.lastSoldDate,
    verification: 'verified_sale',
    provenance: {
      provider: 'ebay_marketplace_insights',
      marketplace: 'ebay',
      totalSoldQuantity: Number.isFinite(Number(item.totalSoldQuantity))
        ? Number(item.totalSoldQuantity)
        : null
    },
    url: item.itemWebUrl,
    condition: item.condition
  }, { now });
}

async function fetchItemSales(fetchImpl, url, accessToken, options) {
  const controller = new AbortController();
  const timeoutMs = boundedPositiveInteger(options.timeoutMs, 5000, MAX_TIMEOUT_MS);
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetchImpl(url, {
      signal: controller.signal,
      redirect: 'error',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-EBAY-C-MARKETPLACE-ID': options.marketplaceId || 'EBAY_US'
      }
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error('eBay Marketplace Insights API request timed out');
    }
    throw new Error('eBay Marketplace Insights API request failed');
  } finally {
    clearTimeout(timer);
  }
}

export function createEbayMarketplaceInsightsProvider(config = {}) {
  const fetchImpl = config.fetchImpl || globalThis.fetch;

  return {
    name: 'ebay_marketplace_insights',

    async searchSoldEvidence(query, options = {}) {
      const accessToken = config.accessToken || process.env.EBAY_MARKETPLACE_INSIGHTS_ACCESS_TOKEN;
      if (!accessToken) {
        throw new Error('EBAY_MARKETPLACE_INSIGHTS_ACCESS_TOKEN is required');
      }
      if (typeof fetchImpl !== 'function') {
        throw new Error('A fetch implementation is required');
      }

      const requestOptions = {
        ...options,
        timeoutMs: options.timeoutMs ?? config.timeoutMs
      };
      const url = createSearchUrl(query, requestOptions);
      const response = await fetchItemSales(fetchImpl, url, accessToken, requestOptions);

      if (!response.ok) {
        throw new Error(`eBay Marketplace Insights API request failed (${response.status})`);
      }

      const payload = await response.json();
      if (!payload || typeof payload !== 'object' || !Array.isArray(payload.itemSales)) {
        throw new Error('eBay Marketplace Insights API returned a malformed response');
      }

      const now = config.now instanceof Date ? config.now : new Date();
      return payload.itemSales
        .slice(0, boundedPositiveInteger(requestOptions.limit, 20, MAX_RESULTS))
        .map((item) => normalizeItemSale(item, now))
        .filter(Boolean);
    }
  };
}
