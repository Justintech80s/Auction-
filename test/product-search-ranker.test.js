import test from 'node:test';
import assert from 'node:assert/strict';
import { rankOffers } from '../src/product-search/ranker.js';
import { dellIdentity, dellOffer } from './helpers/product-search-fixtures.js';

test('keeps New, Refurbished, Used, and Unknown conditions separate', () => {
  const result = rankOffers(dellIdentity(), [
    dellOffer({ sourceId: 'new-1', condition: 'new', itemPrice: 400, shipping: 0, url: 'https://shop.example/new' }),
    dellOffer({ sourceId: 'refurb-1', condition: 'refurbished', itemPrice: 300, shipping: 0, url: 'https://shop.example/refurb' }),
    dellOffer({ sourceId: 'used-1', condition: 'used', itemPrice: 220, shipping: 10, url: 'https://shop.example/used' }),
    dellOffer({ sourceId: 'unknown-1', condition: 'open box', itemPrice: 210, shipping: 10, url: 'https://shop.example/unknown' })
  ]);

  assert.deepEqual(result.groups.new.offerIds, ['fixture-store:new-1']);
  assert.deepEqual(result.groups.refurbished.offerIds, ['fixture-store:refurb-1']);
  assert.deepEqual(result.groups.used.offerIds, ['fixture-store:used-1']);
  assert.deepEqual(result.groups.unknown.offerIds, ['fixture-store:unknown-1']);
});

test('ranks cheapest item price and cheapest confirmed delivered total independently', () => {
  const result = rankOffers(dellIdentity(), [
    dellOffer({ sourceId: 'used-1', itemPrice: 200, shipping: 25, url: 'https://shop.example/used-1' }),
    dellOffer({ sourceId: 'used-2', itemPrice: 210, shipping: 0, url: 'https://shop.example/used-2' })
  ]);

  assert.equal(result.groups.used.cheapestItemId, 'fixture-store:used-1');
  assert.equal(result.groups.used.cheapestTotalId, 'fixture-store:used-2');
});

test('unknown shipping cannot win confirmed total ranking by assumed zero', () => {
  const result = rankOffers(dellIdentity(), [
    dellOffer({ sourceId: 'unknown-shipping', itemPrice: 180, shipping: null, url: 'https://shop.example/unknown-shipping' }),
    dellOffer({ sourceId: 'confirmed', itemPrice: 190, shipping: 5, url: 'https://shop.example/confirmed' })
  ]);

  assert.equal(result.groups.used.cheapestItemId, 'fixture-store:unknown-shipping');
  assert.equal(result.groups.used.cheapestTotalId, 'fixture-store:confirmed');
});

test('Guardian review and rejected matches remain visible but cannot become recommendation ids', () => {
  const result = rankOffers(dellIdentity(), [
    dellOffer({ sourceId: 'review', trustTier: 'broad', sourceConfidence: 0.5, itemPrice: 100, shipping: 0, url: 'https://shop.example/review' }),
    dellOffer({ sourceId: 'safe', itemPrice: 220, shipping: 0, url: 'https://shop.example/safe' }),
    dellOffer({ sourceId: 'accessory', title: 'Replacement keyboard for Dell Latitude 7420', itemPrice: 20, shipping: 0, url: 'https://shop.example/accessory' })
  ]);

  assert.equal(result.groups.used.offerIds.includes('fixture-store:review'), true);
  assert.equal(result.groups.used.offerIds.includes('fixture-store:accessory'), true);
  assert.equal(result.groups.used.cheapestItemId, 'fixture-store:safe');
  assert.equal(result.groups.used.cheapestTotalId, 'fixture-store:safe');
  assert.equal(result.groups.used.bestExactId, 'fixture-store:safe');
});
