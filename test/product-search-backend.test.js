import test from 'node:test';
import assert from 'node:assert/strict';
import { createProductSearchBackend } from '../src/connectors/product-search-backend.js';
import { dellEvidence, dellIdentity, dellOffer } from './helpers/product-search-fixtures.js';

test('backend sends only bounded evidence to visual identification endpoint', async () => {
  let posted;
  let requestOptions;
  const backend = createProductSearchBackend({
    endpoint: 'https://backend.example/api/auction',
    fetchImpl: async (_url, options) => {
      requestOptions = options;
      posted = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({
          status: 'identified',
          identity: {
            title: 'Dell Latitude 7420',
            brand: 'Dell',
            model: 'Latitude 7420',
            category: 'Laptop',
            condition: 'used',
            identifiers: { mpn: 'LAT7420' },
            specs: {},
            sourceUrl: 'https://shop.example/item',
            imageUrl: 'https://images.example/dell.jpg',
            confidence: 0.9
          }
        })
      };
    }
  });

  await backend.identifyProduct({
    ...dellEvidence(),
    rawHtml: '<form>secret</form>',
    cookie: 'session=secret'
  });

  assert.equal(posted.action, 'identify_product');
  assert.equal('rawHtml' in posted.evidence, false);
  assert.equal('cookie' in posted.evidence, false);
  assert.equal(requestOptions.redirect, 'error');
  assert.equal(requestOptions.headers['content-type'], 'application/json');
});

test('backend posts normalized identity for search_offers and normalizes returned offers', async () => {
  let posted;
  const backend = createProductSearchBackend({
    endpoint: 'https://backend.example/api/auction',
    fetchImpl: async (_url, options) => {
      posted = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({
          offers: [{ ...dellOffer(), secretToken: 'remove-me' }]
        })
      };
    }
  });

  const offers = await backend.searchOffers({ ...dellIdentity(), rawHtml: '<html>secret</html>' });

  assert.equal(posted.action, 'search_offers');
  assert.equal(posted.identity.model, 'Latitude 7420');
  assert.equal('rawHtml' in posted.identity, false);
  assert.equal(offers.length, 1);
  assert.equal(offers[0].offerId, 'fixture-store:offer-1');
  assert.equal('secretToken' in offers[0], false);
});

test('backend rejects malformed shopping responses with a safe error', async () => {
  const backend = createProductSearchBackend({
    endpoint: 'https://backend.example/api/auction',
    fetchImpl: async () => ({ ok: true, json: async () => ({ offers: {} }) })
  });

  await assert.rejects(
    () => backend.searchOffers(dellIdentity()),
    error => error.message === 'product_search_backend_unavailable'
  );
});

test('backend rejects non-https endpoints before fetch', () => {
  assert.throws(
    () => createProductSearchBackend({ endpoint: 'http://backend.example/api/auction', fetchImpl: async () => ({}) }),
    /https/i
  );
});

test('backend exposes only a safe error when upstream request fails', async () => {
  const backend = createProductSearchBackend({
    endpoint: 'https://backend.example/api/auction',
    fetchImpl: async () => {
      throw new Error('upstream token=super-secret');
    }
  });

  await assert.rejects(
    () => backend.identifyProduct(dellEvidence()),
    error => {
      assert.equal(error.message, 'product_search_backend_unavailable');
      assert.equal(error.message.includes('super-secret'), false);
      return true;
    }
  );
});
