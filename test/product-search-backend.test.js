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

test('backend scanProduct returns the website-style shared result contract', async () => {
  let posted;
  const offer = dellOffer();
  const backend = createProductSearchBackend({
    endpoint: 'https://backend.example/auction/product-scan',
    fetchImpl: async (_url, options) => {
      posted = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({
          status: 'complete',
          identifiedProduct: {
            title: 'Dell Latitude 7420',
            brand: 'Dell',
            model: 'Latitude 7420',
            features: ['16GB RAM', '512GB SSD'],
            imageUrl: 'https://images.example/dell.jpg',
            confidence: 0.96
          },
          lowestPrice: {
            amount: 399.99,
            currency: 'USD',
            store: 'Fixture Store',
            url: 'https://store.example/dell',
            shipping: 12,
            estimatedTotal: 411.99,
            condition: 'used'
          },
          priceComparison: [{
            store: offer.store,
            title: offer.title,
            price: offer.itemPrice,
            currency: offer.currency,
            shipping: offer.shipping,
            estimatedTotal: offer.estimatedTotal,
            condition: offer.condition,
            description: 'Exact model match',
            url: offer.url,
            imageUrl: offer.imageUrl,
            matchConfidence: 0.98,
            guardianDecision: 'allow'
          }],
          savingsTips: ['Compare delivered totals before buying.'],
          providerErrors: []
        })
      };
    }
  });

  const result = await backend.scanProduct({
    ...dellEvidence(),
    rawHtml: '<form>secret</form>',
    cookie: 'session=secret'
  });

  assert.equal(posted.source, 'browser_extension');
  assert.equal(posted.action, 'product_scan');
  assert.equal('rawHtml' in posted.evidence, false);
  assert.equal('cookie' in posted.evidence, false);
  assert.equal(result.status, 'complete');
  assert.equal(result.identifiedProduct.model, 'Latitude 7420');
  assert.deepEqual(result.identifiedProduct.features, ['16GB RAM', '512GB SSD']);
  assert.equal(result.lowestPrice.amount, 399.99);
  assert.equal(result.priceComparison.length, 1);
  assert.equal(result.priceComparison[0].description, 'Exact model match');
  assert.equal(result.priceComparison[0].guardianDecision, 'allow');
  assert.deepEqual(result.savingsTips, ['Compare delivered totals before buying.']);
});

test('backend scanProduct drops unsafe merchant links instead of returning them', async () => {
  const backend = createProductSearchBackend({
    endpoint: 'https://backend.example/auction/product-scan',
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        status: 'partial_results',
        identifiedProduct: {
          title: 'Dell Latitude 7420',
          brand: 'Dell',
          model: 'Latitude 7420',
          features: [],
          imageUrl: null,
          confidence: 0.8
        },
        lowestPrice: null,
        priceComparison: [{
          store: 'Bad Store',
          title: 'Dell Latitude 7420',
          price: 1,
          currency: 'USD',
          shipping: null,
          estimatedTotal: null,
          condition: 'used',
          description: 'Unsafe URL',
          url: 'javascript:alert(1)',
          imageUrl: null,
          matchConfidence: 1,
          guardianDecision: 'allow'
        }],
        savingsTips: [],
        providerErrors: []
      })
    })
  });

  const result = await backend.scanProduct(dellEvidence());
  assert.equal(result.priceComparison.length, 0);
  assert.equal(result.lowestPrice, null);
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
