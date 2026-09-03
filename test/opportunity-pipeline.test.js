import test from 'node:test';
import assert from 'node:assert/strict';
import { valueItem } from '../src/pipeline.js';

const evidence = [
  { source: 'fixture', sourceId: '1', title: 'Sony WM-2 Walkman', price: 100, currency: 'USD', status: 'sold' },
  { source: 'fixture', sourceId: '2', title: 'Sony WM-2 Walkman', price: 120, currency: 'USD', status: 'sold' },
  { source: 'fixture', sourceId: '3', title: 'Sony WM-2 Walkman', price: 110, currency: 'USD', status: 'sold' }
];

test('valueItem adds opportunity analysis when acquisition price is supplied', async () => {
  const result = await valueItem(
    { brand: 'Sony', model: 'WM-2', category: 'Walkman' },
    { search: async () => evidence, acquisitionPrice: 50 }
  );

  assert.ok(result.opportunity);
  assert.equal(result.opportunity.acquisitionPrice, 50);
  assert.ok(['strong_buy', 'buy', 'fair'].includes(result.opportunity.decision));
});

test('Guardian decision is carried into opportunity analysis', async () => {
  const result = await valueItem(
    { brand: 'Sony', model: 'WM-2', category: 'Walkman' },
    { search: async () => evidence, acquisitionPrice: 50, guardian: true }
  );

  assert.equal(result.opportunity.securityDecision, result.security.decision);
  if (['review', 'reject'].includes(result.security.decision)) {
    assert.equal(result.opportunity.decision, 'manual_review');
  }
});
