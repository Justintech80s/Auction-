import test from 'node:test';
import assert from 'node:assert/strict';
import { scanProductPage } from '../extension/content/scanner.js';

function productAdapter(name, host) {
  return {
    name,
    matches(url) { return new URL(url).hostname === host; },
    extract(_documentLike, context) {
      return {
        source: name,
        url: context.url,
        title: `${name} item`,
        price: 100,
        currency: 'USD',
        condition: null,
        seller: null,
        brand: null,
        model: null,
        category: null,
        identifiers: {},
        capturedAt: '2026-09-12T12:00:00.000Z'
      };
    }
  };
}

test('selects the first matching marketplace adapter', () => {
  const result = scanProductPage({
    url: 'https://www.ebay.com/itm/123',
    documentLike: {},
    now: new Date('2026-09-12T12:00:00Z'),
    adapters: [productAdapter('ebay', 'www.ebay.com'), productAdapter('generic', 'www.ebay.com')]
  });

  assert.equal(result.status, 'detected');
  assert.equal(result.adapter, 'ebay');
  assert.equal(result.product.source, 'ebay');
});

test('uses generic adapter only when explicit adapters do not match', () => {
  const generic = {
    name: 'generic',
    matches() { return true; },
    extract(_documentLike, context) {
      return {
        source: 'generic', url: context.url, title: 'Generic Product', price: 25,
        currency: 'USD', condition: null, seller: null, brand: null, model: null,
        category: null, identifiers: {}, capturedAt: '2026-09-12T12:00:00.000Z'
      };
    }
  };
  const result = scanProductPage({
    url: 'https://shop.example.com/product/1', documentLike: {}, adapters: [productAdapter('ebay', 'www.ebay.com'), generic]
  });
  assert.equal(result.status, 'detected');
  assert.equal(result.adapter, 'generic');
});

test('returns unsupported when no adapter matches', () => {
  const result = scanProductPage({
    url: 'https://example.com/about', documentLike: {}, adapters: [productAdapter('ebay', 'www.ebay.com')]
  });
  assert.deepEqual(result, { status: 'unsupported', product: null, adapter: null });
});

test('returns invalid when a matching adapter throws', () => {
  const result = scanProductPage({
    url: 'https://broken.example/item/1',
    documentLike: {},
    adapters: [{ name: 'broken', matches() { return true; }, extract() { throw new Error('page secret'); } }]
  });
  assert.deepEqual(result, { status: 'invalid', product: null, adapter: 'broken' });
  assert.equal(JSON.stringify(result).includes('page secret'), false);
});

test('returns invalid when adapter output violates the normalized contract', () => {
  const result = scanProductPage({
    url: 'https://bad.example/item/1',
    documentLike: {},
    adapters: [{ name: 'bad', matches() { return true; }, extract() { return { title: 'Missing fields' }; } }]
  });
  assert.deepEqual(result, { status: 'invalid', product: null, adapter: 'bad' });
});

test('treats a matched adapter returning null as unsupported product content', () => {
  const result = scanProductPage({
    url: 'https://empty.example/item/1',
    documentLike: {},
    adapters: [{ name: 'empty', matches() { return true; }, extract() { return null; } }]
  });
  assert.deepEqual(result, { status: 'unsupported', product: null, adapter: 'empty' });
});
