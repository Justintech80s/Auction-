import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyEvidence, dedupeComparables, estimateValue } from '../src/valuation.js';

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

test('returns insufficient evidence instead of false precision', () => {
  const result = estimateValue([
    { source: 'a', sourceId: '1', price: 100, status: 'active', similarity: 0.2 }
  ]);
  assert.equal(result.status, 'insufficient_evidence');
});
