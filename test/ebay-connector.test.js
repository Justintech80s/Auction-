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

test('eBay connector throws a useful error when the marketplace API rejects the request', async () => {
  const fetchImpl = async () => ({
    ok: false,
    status: 401,
    text: async () => 'invalid access token'
  });

  await assert.rejects(
    () => searchEbay('camera', { accessToken: 'bad-token', fetchImpl }),
    /eBay Browse API request failed \(401\)/
  );
});
