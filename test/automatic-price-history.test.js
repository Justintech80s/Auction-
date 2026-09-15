import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeScanEvidence } from '../src/product-search/contracts.js';
import { readFile } from 'node:fs/promises';

test('scan evidence carries a bounded observed USD page price', () => {
  const evidence = normalizeScanEvidence({
    sourceUrl: 'https://www.amazon.com/dp/B012345678',
    title: 'Example Product',
    identifiers: { asin: 'B012345678' },
    observedPrice: 219.99,
    observedCurrency: 'USD',
    confidence: 0.9,
    capturedAt: '2026-09-15T12:00:00.000Z'
  });
  assert.equal(evidence.observedPrice, 219.99);
  assert.equal(evidence.observedCurrency, 'USD');
  assert.equal(evidence.identifiers.asin, 'B012345678');
});

test('scan evidence rejects non-positive observed prices', () => {
  assert.throws(() => normalizeScanEvidence({
    sourceUrl: 'https://example.com/product', title: 'Bad Price', observedPrice: 0,
    observedCurrency: 'USD', confidence: 0.5
  }), /observedPrice/);
});

test('page observation migration is server-only and indexed for product history', async () => {
  const sql = await readFile(new URL('../database/migrations/003_add_page_price_observations.sql', import.meta.url), 'utf8');
  assert.match(sql, /create table auction\.page_price_observations/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all on auction\.page_price_observations from anon/i);
  assert.match(sql, /product_id, observed_at desc/i);
});
