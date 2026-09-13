import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeDetectedProduct,
  assertMarketplaceAdapter
} from '../extension/adapters/contract.js';
import {
  registerMarketplaceAdapter,
  getMarketplaceAdapter
} from '../extension/adapters/registry.js';

const NOW = new Date('2026-09-12T12:00:00Z');

function validProduct(overrides = {}) {
  return {
    source: 'ebay',
    url: 'https://www.ebay.com/itm/123',
    title: 'Sony WM-2 Walkman',
    price: 129.99,
    currency: 'USD',
    ...overrides
  };
}

test('normalizes a valid detected product into an immutable bounded contract', () => {
  const product = normalizeDetectedProduct(validProduct({
    condition: 'Used',
    seller: 'trusted-seller',
    brand: 'Sony',
    model: 'WM-2',
    category: 'Portable Cassette Players',
    identifiers: { sku: 'ABC-123' }
  }), { now: NOW });

  assert.deepEqual(product, {
    source: 'ebay',
    url: 'https://www.ebay.com/itm/123',
    title: 'Sony WM-2 Walkman',
    price: 129.99,
    currency: 'USD',
    condition: 'Used',
    seller: 'trusted-seller',
    brand: 'Sony',
    model: 'WM-2',
    category: 'Portable Cassette Players',
    identifiers: { sku: 'ABC-123' },
    capturedAt: '2026-09-12T12:00:00.000Z'
  });
  assert.equal(Object.isFrozen(product), true);
  assert.equal(Object.isFrozen(product.identifiers), true);
});

test('requires a non-empty title', () => {
  assert.throws(() => normalizeDetectedProduct(validProduct({ title: '   ' })), /title/i);
});

test('rejects invalid asking prices', () => {
  for (const price of [-1, 0, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => normalizeDetectedProduct(validProduct({ price })), /price/i);
  }
});

test('allows a missing price but not unsupported currency when price exists', () => {
  const product = normalizeDetectedProduct(validProduct({ price: null, currency: null }), { now: NOW });
  assert.equal(product.price, null);
  assert.equal(product.currency, null);

  assert.throws(() => normalizeDetectedProduct(validProduct({ currency: 'EUR' })), /currency/i);
});

test('requires an https product URL', () => {
  assert.throws(() => normalizeDetectedProduct(validProduct({ url: 'http://example.com/item/1' })), /https/i);
  assert.throws(() => normalizeDetectedProduct(validProduct({ url: 'not-a-url' })), /url/i);
});

test('bounds page-controlled string fields', () => {
  assert.throws(() => normalizeDetectedProduct(validProduct({ title: 'x'.repeat(513) })), /title/i);
  assert.throws(() => normalizeDetectedProduct(validProduct({ seller: 'x'.repeat(257) })), /seller/i);
});

test('validates marketplace adapter shape', () => {
  const adapter = {
    name: 'fixture',
    matches() { return true; },
    extract() { return null; }
  };
  assert.equal(assertMarketplaceAdapter(adapter), adapter);
  assert.throws(() => assertMarketplaceAdapter({ name: 'bad' }), /adapter/i);
});

test('registers and retrieves validated marketplace adapters', () => {
  const adapter = {
    name: 'fixture-contract-test',
    matches() { return true; },
    extract() { return null; }
  };

  registerMarketplaceAdapter('fixture-contract-test', adapter);
  assert.equal(getMarketplaceAdapter('fixture-contract-test'), adapter);
});
