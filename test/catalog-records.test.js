import test from 'node:test';
import assert from 'node:assert/strict';
import { toCatalogRecords } from '../src/persistence/catalog-records.js';

const base = {
  evidence: {
    title: 'Apple AirPods Pro 2nd Generation',
    brand: 'Apple',
    model: 'AirPods Pro 2nd Generation',
    barcode: '0194253970835',
    imageUrl: 'https://i.ebayimg.com/images/g/example.jpg'
  },
  identifiedProduct: {
    name: 'Apple AirPods Pro 2nd Generation',
    brand: 'Apple',
    model: 'AirPods Pro 2nd Generation'
  },
  offer: {
    source: 'ebay',
    sourceId: 'v1|123|0',
    store: 'eBay',
    url: 'https://www.ebay.com/itm/123',
    imageUrl: 'https://i.ebayimg.com/images/g/example.jpg',
    itemPrice: 220,
    shipping: null,
    currency: 'USD',
    condition: 'NEW',
    availability: 'in_stock',
    guardianDecision: 'allow',
    matchClassification: 'exact'
  }
};

test('maps accepted exact offer and preserves unknown shipping', () => {
  const records = toCatalogRecords(base);
  assert.equal(records.offer.shippingPrice, null);
  assert.equal(records.history.shippingPrice, null);
  assert.equal(records.offer.purchaseUrl, 'https://www.ebay.com/itm/123');
  assert.equal(records.store.websiteUrl, 'https://www.ebay.com');
});

test('does not persist Guardian-rejected offer', () => {
  assert.equal(toCatalogRecords({ ...base, offer: { ...base.offer, guardianDecision: 'reject' } }), null);
});

test('does not persist candidate/mismatch offers to history', () => {
  assert.equal(toCatalogRecords({ ...base, offer: { ...base.offer, matchClassification: 'candidate' } }), null);
});

test('rejects unsafe purchase URLs and non-positive prices', () => {
  assert.equal(toCatalogRecords({ ...base, offer: { ...base.offer, url: 'http://example.com/item' } }), null);
  assert.equal(toCatalogRecords({ ...base, offer: { ...base.offer, itemPrice: 0 } }), null);
});

test('copies only allowlisted safe fields', () => {
  const records = toCatalogRecords({
    ...base,
    evidence: { ...base.evidence, rawHtml: '<form>secret</form>', cookies: 'secret' },
    offer: { ...base.offer, authorization: 'Bearer secret', token: 'secret' }
  });

  const serialized = JSON.stringify(records);
  assert.doesNotMatch(serialized, /rawHtml|cookies|authorization|Bearer secret|token/);
});
