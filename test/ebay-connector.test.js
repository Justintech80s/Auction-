import test from 'node:test';
import assert from 'node:assert/strict';
import { searchEbay } from '../src/connectors/ebay.js';

test('eBay connector rejects missing access token before making a request', async () => {
  await assert.rejects(
    () => searchEbay('vintage camera', { accessToken: '', fetchImpl: async () => { throw new Error('should not fetch'); } }),
    /EBAY_ACCESS_TOKEN/
  );
});

test('eBay connector searches the official Browse API and normalizes active listings as asking evidence', async () => {
  let requestUrl;
  let requestOptions;
  const fetchImpl = async (url, options) => {
    requestUrl = String(url);
    requestOptions = options;
    return {
      ok: true,
      json: async () => ({
        itemSummaries: [
          {
            itemId: 'v1|123|0',
            title: 'Vintage Camera Model X',
            itemWebUrl: 'https://www.ebay.com/itm/123',
            price: { value: '125.50', currency: 'USD' },
            condition: 'Used'
          }
        ]
      })
    };
  };

  const results = await searchEbay('vintage camera model x', {
    accessToken: 'test-token',
    fetchImpl,
    limit: 10
  });

  assert.match(requestUrl, /^https:\/\/api\.ebay\.com\/buy\/browse\/v1\/item_summary\/search\?/);
  assert.match(requestUrl, /q=vintage\+camera\+model\+x/);
  assert.match(requestUrl, /limit=10/);
  assert.equal(requestOptions.headers.Authorization, 'Bearer test-token');
  assert.equal(requestOptions.headers['X-EBAY-C-MARKETPLACE-ID'], 'EBAY_US');
  assert.ok(requestOptions.signal instanceof AbortSignal);
  assert.deepEqual(results, [
    {
      source: 'ebay',
      sourceId: 'v1|123|0',
      title: 'Vintage Camera Model X',
      url: 'https://www.ebay.com/itm/123',
      price: '125.50',
      currency: 'USD',
      condition: 'Used',
      status: 'active',
      evidenceType: 'asking'
    }
  ]);
});

test('eBay connector bounds requested result limits', async () => {
  let requestUrl;
  await searchEbay('camera', {
    accessToken: 'test-token',
    limit: 5000,
    fetchImpl: async (url) => {
      requestUrl = String(url);
      return { ok: true, json: async () => ({ itemSummaries: [] }) };
    }
  });
  assert.match(requestUrl, /limit=100/);
});

test('eBay connector throws a safe error without leaking upstream response content', async () => {
  const fetchImpl = async () => ({
    ok: false,
    status: 401,
    text: async () => 'invalid access token secret-value'
  });

  await assert.rejects(
    () => searchEbay('camera', { accessToken: 'bad-token', fetchImpl }),
    (error) => {
      assert.match(error.message, /eBay Browse API request failed \(401\)/);
      assert.doesNotMatch(error.message, /secret-value|invalid access token/);
      return true;
    }
  );
});

test('eBay connector aborts slow marketplace requests', async () => {
  await assert.rejects(
    () => searchEbay('camera', {
      accessToken: 'test-token',
      timeoutMs: 10,
      fetchImpl: async (_url, options) => new Promise((_, reject) => {
        options.signal.addEventListener('abort', () => reject(new Error('aborted')));
      })
    }),
    /eBay Browse API request timed out/
  );
});
