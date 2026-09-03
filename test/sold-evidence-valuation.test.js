import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateValue } from '../src/valuation.js';

function sale(sourceId, price, verification) {
  return {
    source: 'fixture',
    sourceId,
    price,
    currency: 'USD',
    status: 'sold',
    evidenceType: 'sold',
    verification,
    similarity: 1,
    freshness: { ageDays: 15, isRecent: true }
  };
}

function asking(sourceId, price) {
  return {
    source: 'market',
    sourceId,
    price,
    currency: 'USD',
    status: 'active',
    evidenceType: 'asking',
    similarity: 1
  };
}

test('verified market sales have more valuation authority than seller-scoped or unverified claims', () => {
  const verified = estimateValue([
    sale('v1', 100, 'verified_sale'),
    sale('v2', 105, 'verified_sale'),
    asking('a1', 300)
  ]);
  const sellerScoped = estimateValue([
    sale('s1', 100, 'seller_scoped_sale'),
    sale('s2', 105, 'seller_scoped_sale'),
    asking('a1', 300)
  ]);
  const unverified = estimateValue([
    sale('u1', 100, 'unverified_sale_claim'),
    sale('u2', 105, 'unverified_sale_claim'),
    asking('a1', 300)
  ]);

  assert.ok(verified.estimate < sellerScoped.estimate);
  assert.ok(sellerScoped.estimate < unverified.estimate);
  assert.ok(verified.confidence > sellerScoped.confidence);
  assert.ok(sellerScoped.confidence > unverified.confidence);
});

test('unverified sale claims do not increase confidence above equivalent asking evidence', () => {
  const unverified = estimateValue([
    sale('u1', 100, 'unverified_sale_claim'),
    sale('u2', 105, 'unverified_sale_claim'),
    asking('a1', 115)
  ]);
  const askingOnly = estimateValue([
    asking('u1', 100),
    asking('u2', 105),
    asking('a1', 115)
  ]);

  assert.ok(unverified.confidence <= askingOnly.confidence);
});

test('valuation reports verified sold count and normalized sold evidence quality', () => {
  const result = estimateValue([
    sale('v1', 100, 'verified_sale'),
    sale('s1', 105, 'seller_scoped_sale'),
    sale('u1', 110, 'unverified_sale_claim'),
    asking('a1', 115)
  ]);

  assert.equal(result.verifiedSoldCount, 1);
  assert.ok(result.soldEvidenceQuality > 0);
  assert.ok(result.soldEvidenceQuality < 1);
});

test('asking-only valuation explicitly reports no verified sold authority', () => {
  const result = estimateValue([
    asking('a1', 100),
    asking('a2', 105),
    asking('a3', 110)
  ]);

  assert.equal(result.verifiedSoldCount, 0);
  assert.equal(result.soldEvidenceQuality, 0);
});
