import test from 'node:test';
import assert from 'node:assert/strict';

import { calculateNetEconomics } from '../src/costs/engine.js';

test('calculates gross and net economics from explicit supported costs', () => {
  const result = calculateNetEconomics({
    acquisitionPrice: 100,
    estimatedValue: 200,
    costs: {
      marketplaceFee: 20,
      shipping: 10,
      tax: 5,
      repairs: 15,
      paymentProcessing: 6,
      holding: 4
    }
  });

  assert.deepEqual(result.costBreakdown, {
    marketplaceFee: 20,
    shipping: 10,
    tax: 5,
    repairs: 15,
    paymentProcessing: 6,
    holding: 4
  });
  assert.equal(result.totalCosts, 60);
  assert.equal(result.grossProfit, 100);
  assert.equal(result.grossMarginPct, 50);
  assert.equal(result.netProfit, 40);
  assert.equal(result.netMarginPct, 20);
});

test('treats missing cost fields as zero and ignores unknown fields', () => {
  const result = calculateNetEconomics({
    acquisitionPrice: 50,
    estimatedValue: 100,
    costs: {
      shipping: 7.345,
      inventedMarketplaceGuess: 999
    }
  });

  assert.deepEqual(result.costBreakdown, {
    marketplaceFee: 0,
    shipping: 7.35,
    tax: 0,
    repairs: 0,
    paymentProcessing: 0,
    holding: 0
  });
  assert.equal(result.totalCosts, 7.35);
  assert.equal(result.grossProfit, 50);
  assert.equal(result.netProfit, 42.65);
  assert.equal(result.netMarginPct, 42.65);
  assert.equal('inventedMarketplaceGuess' in result.costBreakdown, false);
});

test('rounds monetary and percentage outputs deterministically', () => {
  const result = calculateNetEconomics({
    acquisitionPrice: 33.333,
    estimatedValue: 100,
    costs: { paymentProcessing: 2.555 }
  });

  assert.equal(result.grossProfit, 66.67);
  assert.equal(result.totalCosts, 2.56);
  assert.equal(result.netProfit, 64.11);
  assert.equal(result.grossMarginPct, 66.67);
  assert.equal(result.netMarginPct, 64.11);
});

test('rejects negative or non-finite cost values', () => {
  for (const invalid of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => calculateNetEconomics({
      acquisitionPrice: 10,
      estimatedValue: 100,
      costs: { shipping: invalid }
    }), /shipping/);
  }
});

test('validates acquisition price and estimated value', () => {
  assert.throws(() => calculateNetEconomics({
    acquisitionPrice: -1,
    estimatedValue: 100
  }), /acquisitionPrice/);

  assert.throws(() => calculateNetEconomics({
    acquisitionPrice: 10,
    estimatedValue: 0
  }), /estimatedValue/);
});
