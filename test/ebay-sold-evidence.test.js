import test from 'node:test';
import assert from 'node:assert/strict';
import { createEbayMarketplaceInsightsProvider } from '../src/sold-evidence/providers/ebay-marketplace-insights.js';

const NOW = new Date('2026-09-03T12:00:00.000Z');

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return payload; }
  };
}

test('eBay Marketplace Insights provider rejects missing access token', async () => {
  const provider = createEbayMarketplaceInsightsProvider({
    accessToken: '',
    fetchImpl: async () => jsonResponse({ itemSales: [] })
  });

  await assert.rejects(
    () => provider.searchSoldEvidence('iphone', { categoryIds: ['9355'] }),
    /EBAY_MARKETPLACE_INSIGHTS_ACCESS_TOKEN is required/
  );
});

test('provider uses approved Marketplace Insights endpoint, headers, bounded query and limit', async () => {
  let capturedUrl;
  let capturedOptions;
  const provider = createEbayMarketplaceInsightsProvider({
    accessToken: 'secret-token',
    now: NOW,
    fetchImpl: async (url, options) => {
      capturedUrl = url;
      capturedOptions = options;
      return jsonResponse({ itemSales: [] });
    }
  });

  await provider.searchSoldEvidence('x'.repeat(600), {
    categoryIds: ['9355'],
    limit: 500,
    marketplaceId: 'EBAY_US'
  });

  assert.equal(capturedUrl.hostname, 'api.ebay.com');
  assert.equal(capturedUrl.pathname, '/buy/marketplace_insights/v1_beta/item_sales/search');
  assert.equal(capturedUrl.searchParams.get('q').length, 512);
  assert.equal(capturedUrl.searchParams.get('limit'), '200');
  assert.equal(capturedUrl.searchParams.get('category_ids'), '9355');
  assert.equal(capturedOptions.redirect, 'error');
  assert.equal(capturedOptions.headers.Authorization, 'Bearer secret-token');
  assert.equal(capturedOptions.headers['X-EBAY-C-MARKETPLACE-ID'], 'EBAY_US');
  assert.ok(capturedOptions.signal instanceof AbortSignal);
});

test('provider normalizes valid itemSales as verified sold evidence', async () => {
  const provider = createEbayMarketplaceInsightsProvider({
    accessToken: 'secret-token',
    now: NOW,
    fetchImpl: async () => jsonResponse({
      itemSales: [{
        itemId: 'v1|123|0',
        title: 'Apple iPhone 15 Pro',
        condition: 'Used',
        itemWebUrl: 'https://www.ebay.com/itm/123',
        lastSoldDate: '2026-08-20T10:00:00.000Z',
        lastSoldPrice: { value: '799.99', currency: 'USD' },
        totalSoldQuantity: 4
      }]
    })
  });

  const records = await provider.searchSoldEvidence('iphone', { categoryIds: ['9355'] });
  assert.equal(records.length, 1);
  assert.equal(records[0].source, 'ebay_marketplace_insights');
  assert.equal(records[0].sourceId, 'v1|123|0');
  assert.equal(records[0].soldPrice, 799.99);
  assert.equal(records[0].currency, 'USD');
  assert.equal(records[0].soldAt, '2026-08-20T10:00:00.000Z');
  assert.equal(records[0].verification, 'verified_sale');
  assert.equal(records[0].status, 'sold');
  assert.equal(records[0].evidenceType, 'sold');
  assert.equal(records[0].provenance.provider, 'ebay_marketplace_insights');
  assert.equal(records[0].provenance.totalSoldQuantity, 4);
});

test('provider rejects malformed responses and returns safe HTTP errors', async () => {
  const malformed = createEbayMarketplaceInsightsProvider({
    accessToken: 'secret-token',
    fetchImpl: async () => jsonResponse({ nope: true })
  });
  await assert.rejects(() => malformed.searchSoldEvidence('camera', { categoryIds: ['625'] }), /malformed response/);

  const failed = createEbayMarketplaceInsightsProvider({
    accessToken: 'secret-token',
    fetchImpl: async () => jsonResponse({ secret: 'upstream-body' }, 403)
  });
  await assert.rejects(
    () => failed.searchSoldEvidence('camera', { categoryIds: ['625'] }),
    (error) => error.message === 'eBay Marketplace Insights API request failed (403)' && !error.message.includes('upstream-body')
  );
});

test('provider aborts slow Marketplace Insights requests', async () => {
  const provider = createEbayMarketplaceInsightsProvider({
    accessToken: 'secret-token',
    timeoutMs: 5,
    fetchImpl: async (_url, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    })
  });

  await assert.rejects(
    () => provider.searchSoldEvidence('watch', { categoryIds: ['31387'] }),
    /request timed out/
  );
});

test('provider requires at least one category id for Marketplace Insights search', async () => {
  const provider = createEbayMarketplaceInsightsProvider({
    accessToken: 'secret-token',
    fetchImpl: async () => jsonResponse({ itemSales: [] })
  });

  await assert.rejects(
    () => provider.searchSoldEvidence('watch'),
    /categoryIds is required/
  );
});
