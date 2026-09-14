import test from 'node:test';
import assert from 'node:assert/strict';
import { screenMatchedOffers } from '../src/product-search/offer-guardian.js';
import { dellOffer } from './helpers/product-search-fixtures.js';

function matched(overrides = {}) {
  const offer = dellOffer(overrides.offer || {});
  return {
    offer,
    match: {
      classification: overrides.classification || 'exact',
      score: overrides.score ?? 0.96,
      reasons: overrides.reasons || []
    }
  };
}

test('allows a trusted high-confidence exact offer at a plausible peer price', () => {
  const screened = screenMatchedOffers([
    matched({ offer: { sourceId: '1', itemPrice: 220 } }),
    matched({ offer: { sourceId: '2', itemPrice: 230, url: 'https://shop.example/products/dell-7420-2' } }),
    matched({ offer: { sourceId: '3', itemPrice: 240, url: 'https://shop.example/products/dell-7420-3' } })
  ]);
  assert.equal(screened[0].guardianDecision, 'allow');
});

test('reviews broad-source offers with weak source confidence', () => {
  const [screened] = screenMatchedOffers([
    matched({ offer: { trustTier: 'broad', sourceConfidence: 0.7 } })
  ]);
  assert.equal(screened.guardianDecision, 'review');
  assert.ok(screened.guardianReasons.includes('weak_source_confidence'));
});

test('reviews implausibly cheap exact offers relative to exact peers', () => {
  const screened = screenMatchedOffers([
    matched({ offer: { sourceId: 'cheap', itemPrice: 40, url: 'https://shop.example/products/cheap' } }),
    matched({ offer: { sourceId: 'normal-1', itemPrice: 220, url: 'https://shop.example/products/normal-1' } }),
    matched({ offer: { sourceId: 'normal-2', itemPrice: 240, url: 'https://shop.example/products/normal-2' } })
  ]);
  assert.equal(screened.find(entry => entry.offer.sourceId === 'cheap').guardianDecision, 'review');
  assert.ok(screened.find(entry => entry.offer.sourceId === 'cheap').guardianReasons.includes('implausible_low_price'));
});

test('rejects offers already rejected by product matching', () => {
  const [screened] = screenMatchedOffers([
    matched({ classification: 'rejected', score: 0.1, reasons: ['accessory'] })
  ]);
  assert.equal(screened.guardianDecision, 'reject');
});
