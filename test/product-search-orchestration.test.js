import test from 'node:test';
import assert from 'node:assert/strict';
import { searchAcrossStores } from '../src/product-search/search.js';
import { dellIdentity, dellOffer } from './helpers/product-search-fixtures.js';

test('keeps successful stores when one provider fails without leaking the exception', async () => {
  const result = await searchAcrossStores(dellIdentity(), {
    providers: [
      {
        name: 'trusted-a', trustTier: 'trusted',
        async searchOffers() {
          return [dellOffer({ source: 'trusted-a', sourceId: '1', url: 'https://shop.example/a' })];
        }
      },
      {
        name: 'broken', trustTier: 'broad',
        async searchOffers() { throw new Error('token=secret'); }
      }
    ]
  });

  assert.equal(result.offers.length, 1);
  assert.equal(result.offers[0].trustTier, 'trusted');
  assert.deepEqual(result.providerErrors, [{ source: 'broken', code: 'provider_unavailable' }]);
  assert.equal(JSON.stringify(result).includes('token=secret'), false);
});

test('stamps provider trust tier instead of trusting remote offer trustTier', async () => {
  const result = await searchAcrossStores(dellIdentity(), {
    providers: [{
      name: 'broad-provider', trustTier: 'broad',
      async searchOffers() {
        return [dellOffer({ source: 'small-store', trustTier: 'trusted' })];
      }
    }]
  });
  assert.equal(result.offers[0].trustTier, 'broad');
});

test('caps every provider at 30 normalized offers and the combined result at 60', async () => {
  function provider(name, offset) {
    return {
      name,
      trustTier: 'trusted',
      async searchOffers() {
        return Array.from({ length: 40 }, (_, index) => dellOffer({
          source: name,
          sourceId: String(offset + index),
          url: `https://${name}.example/products/${offset + index}`
        }));
      }
    };
  }

  const result = await searchAcrossStores(dellIdentity(), {
    providers: [provider('store-a', 0), provider('store-b', 100), provider('store-c', 200)]
  });
  assert.equal(result.offers.length, 60);
});

test('deduplicates first by offer id and then by canonical URL', async () => {
  const result = await searchAcrossStores(dellIdentity(), {
    providers: [{
      name: 'provider', trustTier: 'trusted',
      async searchOffers() {
        return [
          dellOffer({ source: 'shop', sourceId: '1', url: 'https://shop.example/item#one' }),
          dellOffer({ source: 'shop', sourceId: '1', url: 'https://shop.example/duplicate-id' }),
          dellOffer({ source: 'shop', sourceId: '2', url: 'https://shop.example/item#two' })
        ];
      }
    }]
  });
  assert.equal(result.offers.length, 1);
  assert.equal(result.offers[0].offerId, 'shop:1');
});

test('isolates malformed provider output while preserving valid providers', async () => {
  const result = await searchAcrossStores(dellIdentity(), {
    providers: [
      { name: 'malformed', trustTier: 'broad', async searchOffers() { return { offers: [] }; } },
      { name: 'good', trustTier: 'trusted', async searchOffers() { return [dellOffer({ source: 'good' })]; } }
    ]
  });
  assert.equal(result.offers.length, 1);
  assert.deepEqual(result.providerErrors, [{ source: 'malformed', code: 'provider_unavailable' }]);
});

test('zero configured providers returns an explicit safe unavailable record', async () => {
  const result = await searchAcrossStores(dellIdentity(), { providers: [] });
  assert.deepEqual(result, {
    offers: [],
    providerErrors: [{ source: 'shopping', code: 'provider_unavailable' }]
  });
});
