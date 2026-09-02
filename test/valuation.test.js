import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyEvidence,
  dedupeComparables,
  estimateValue,
  normalizePrice,
  removeOutliers
} from '../src/valuation.js';

test('classifies explicit sold evidence separately from asking evidence', () => {
  assert.equal(classifyEvidence({ status: 'sold' }), 'sold');
  assert.equal(classifyEvidence({ status: 'active' }), 'asking');
});

test('deduplicates comparable listings by canonical source id', () => {
  const result = dedupeComparables([
    { source: 'market-a', sourceId: '123', price: 100 },
    { source: 'market-a', sourceId: '123', price: 100 },
    { source: 'market-b', sourceId: '456', price: 110 }
  ]);
  assert.equal(result.length, 2);
});

test('normalizes formatted USD prices into numeric values', () => {
  assert.equal(normalizePrice('$1,249.99', 'USD'), 1249.99);
  assert.equal(normalizePrice(' 850 ', 'USD'), 850);
});

test('rejects unsupported currencies instead of silently converting them', () => {
  assert.equal(normalizePrice('100', 'EUR'), null);
});

test('removes extreme price outliers while keeping the central comparable set', () => {
  const filtered = removeOutliers([
    { price: 95 },
    { price: 100 },
    { price: 105 },
    { price: 110 },
    { price: 1000 }
  ]);
  assert.deepEqual(filtered.map((item) => item.price), [95, 100, 105, 110]);
});

test('weights sold evidence more strongly than asking prices', () => {
  const result = estimateValue([
    { source: 'a', sourceId: '1', price: 100, status: 'sold', similarity: 1 },
    { source: 'b', sourceId: '2', price: 110, status: 'sold', similarity: 1 },
    { source: 'c', sourceId: '3', price: 300, status: 'active', similarity: 1 }
  ]);
  assert.ok(result.estimate < 180);
  assert.equal(result.soldCount, 2);
  assert.equal(result.askingCount, 1);
});

test('returns a valuation range and confidence for strong evidence', () => {
  const result = estimateValue([
    { source: 'a', sourceId: '1', price: '$100', currency: 'USD', status: 'sold', similarity: 1 },
    { source: 'b', sourceId: '2', price: '$105', currency: 'USD', status: 'sold', similarity: 0.95 },
    { source: 'c', sourceId: '3', price: '$110', currency: 'USD', status: 'sold', similarity: 0.9 },
    { source: 'd', sourceId: '4', price: '$120', currency: 'USD', status: 'active', similarity: 0.9 }
  ]);
  assert.equal(result.status, 'ok');
  assert.ok(result.range.low <= result.estimate);
  assert.ok(result.range.high >= result.estimate);
  assert.ok(result.confidence >= 0 && result.confidence <= 1);
  assert.equal(result.evidenceCount, 4);
});

test('outliers do not dominate the final valuation', () => {
  const result = estimateValue([
    { source: 'a', sourceId: '1', price: 100, status: 'sold', similarity: 1 },
    { source: 'b', sourceId: '2', price: 105, status: 'sold', similarity: 1 },
    { source: 'c', sourceId: '3', price: 110, status: 'sold', similarity: 1 },
    { source: 'd', sourceId: '4', price: 5000, status: 'active', similarity: 1 }
  ]);
  assert.ok(result.estimate < 200);
  assert.equal(result.outlierCount, 1);
});

test('returns insufficient evidence instead of false precision', () => {
  const result = estimateValue([
    { source: 'a', sourceId: '1', price: 100, status: 'active', similarity: 0.2 }
  ]);
  assert.equal(result.status, 'insufficient_evidence');
  assert.equal(result.estimate, null);
  assert.equal(result.confidence, 0);
});
