import test from 'node:test';
import assert from 'node:assert/strict';
import { createProductSearchBackend } from '../src/connectors/product-search-backend.js';
import { dellEvidence } from './helpers/product-search-fixtures.js';

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
