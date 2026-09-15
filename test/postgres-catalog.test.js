import test from 'node:test';
import assert from 'node:assert/strict';
import { createPostgresCatalog } from '../src/persistence/postgres-catalog.js';

const records = {
  product: {
    name: 'Apple AirPods Pro 2nd Generation',
    brand: 'Apple',
    model: 'AirPods Pro 2nd Generation',
    barcode: '0194253970835',
    specifications: {},
    imageUrls: ['https://i.ebayimg.com/images/g/example.jpg']
  },
  store: {
    name: 'eBay',
    websiteUrl: 'https://www.ebay.com'
  },
  offer: {
    provider: 'ebay',
    providerOfferId: 'v1|123|0',
    itemPrice: 220,
    shippingPrice: null,
    currency: 'USD',
    condition: 'NEW',
    availability: 'in_stock',
    purchaseUrl: 'https://www.ebay.com/itm/123',
    imageUrl: 'https://i.ebayimg.com/images/g/example.jpg',
    guardianDecision: 'allow',
    matchClassification: 'exact'
  },
  history: {
    itemPrice: 220,
    shippingPrice: null,
    currency: 'USD'
  }
};

test('persists product, store, offer, then price history with parameterized SQL', async () => {
  const calls = [];
  const ids = ['product-1', 'store-1', 'offer-1'];
  const query = async (text, params = []) => {
    calls.push({ text, params });
    if (calls.length <= 3) return { rows: [{ id: ids[calls.length - 1] }] };
    return { rows: [] };
  };

  const catalog = createPostgresCatalog({ query });
  const result = await catalog.persistScanResult(records);

  assert.deepEqual(result, { productId: 'product-1', storeId: 'store-1', offerId: 'offer-1' });
  assert.equal(calls.length, 4);
  assert.match(calls[0].text, /auction\.products/i);
  assert.match(calls[1].text, /auction\.stores/i);
  assert.match(calls[2].text, /auction\.offers/i);
  assert.match(calls[3].text, /auction\.price_history/i);
  for (const call of calls) {
    assert.match(call.text, /\$1/);
    assert.doesNotMatch(call.text, /Apple AirPods Pro|https:\/\/www\.ebay\.com\/itm\/123/);
  }
  assert.ok(calls[2].params.includes(null));
  assert.ok(calls[3].params.includes(null));
});

test('uses fallback product lookup when barcode is absent', async () => {
  const calls = [];
  const query = async (text, params = []) => {
    calls.push({ text, params });
    if (/select\s+id\s+from\s+auction\.products/i.test(text)) return { rows: [{ id: 'product-existing' }] };
    if (/auction\.stores/i.test(text)) return { rows: [{ id: 'store-1' }] };
    if (/auction\.offers/i.test(text)) return { rows: [{ id: 'offer-1' }] };
    return { rows: [] };
  };

  const catalog = createPostgresCatalog({ query });
  const result = await catalog.persistScanResult({
    ...records,
    product: { ...records.product, barcode: null }
  });

  assert.equal(result.productId, 'product-existing');
  assert.match(calls[0].text, /select\s+id\s+from\s+auction\.products/i);
});

test('uses one transaction and rolls back if price-history persistence fails', async () => {
  const clientCalls = [];
  const client = {
    async query(text, params = []) {
      clientCalls.push({ text, params });
      if (/^begin$/i.test(text) || /^commit$/i.test(text) || /^rollback$/i.test(text)) return { rows: [] };
      if (/auction\.products/i.test(text)) return { rows: [{ id: 'product-1' }] };
      if (/auction\.stores/i.test(text)) return { rows: [{ id: 'store-1' }] };
      if (/auction\.offers/i.test(text)) return { rows: [{ id: 'offer-1' }] };
      if (/auction\.price_history/i.test(text)) throw new Error('history_write_failed');
      return { rows: [] };
    },
    release() {
      clientCalls.push({ text: 'RELEASE', params: [] });
    }
  };
  const pool = {
    async connect() {
      return client;
    }
  };

  const catalog = createPostgresCatalog({ pool });
  await assert.rejects(() => catalog.persistScanResult(records), /history_write_failed/);

  assert.equal(clientCalls[0].text, 'BEGIN');
  assert.ok(clientCalls.some(call => /^rollback$/i.test(call.text)));
  assert.equal(clientCalls.some(call => /^commit$/i.test(call.text)), false);
  assert.equal(clientCalls.at(-1).text, 'RELEASE');
});

test('rejects records that did not pass the safe mapper contract', async () => {
  let called = false;
  const catalog = createPostgresCatalog({ query: async () => { called = true; return { rows: [] }; } });
  await assert.rejects(
    () => catalog.persistScanResult({ ...records, offer: { ...records.offer, guardianDecision: 'reject' } }),
    /invalid_catalog_records/
  );
  assert.equal(called, false);
});
