import test from 'node:test';
import assert from 'node:assert/strict';
import { createEbayBrowseProvider } from '../src/product-search/providers/ebay-browse.js';

test('eBay provider exchanges client credentials and maps Browse API offers', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('/identity/v1/oauth2/token')) {
      return new Response(JSON.stringify({ access_token: 'app-token', expires_in: 7200 }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    return new Response(JSON.stringify({
      itemSummaries: [{
        itemId: 'v1|123|0',
        title: 'Dell Latitude 7420 16GB 512GB SSD',
        itemWebUrl: 'https://www.ebay.com/itm/123',
        image: { imageUrl: 'https://i.ebayimg.com/images/g/test.jpg' },
        price: { value: '219.99', currency: 'USD' },
        shippingOptions: [{ shippingCost: { value: '12.50', currency: 'USD' } }],
        condition: 'Used'
      }]
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };

  const provider = createEbayBrowseProvider({
    clientId: 'client-id',
    clientSecret: 'client-secret',
    fetchImpl
  });
  const offers = await provider.searchOffers({
    title: 'Dell Latitude 7420',
    brand: 'Dell',
    model: 'Latitude 7420'
  }, { limit: 10 });

  assert.equal(provider.name, 'ebay');
  assert.equal(provider.trustTier, 'trusted');
  assert.equal(offers.length, 1);
  assert.deepEqual(offers[0], {
    source: 'ebay',
    sourceId: 'v1|123|0',
    store: 'eBay',
    title: 'Dell Latitude 7420 16GB 512GB SSD',
    url: 'https://www.ebay.com/itm/123',
    imageUrl: 'https://i.ebayimg.com/images/g/test.jpg',
    brand: null,
    model: null,
    category: null,
    identifiers: {},
    specs: {},
    condition: 'Used',
    itemPrice: 219.99,
    shipping: 12.5,
    currency: 'USD',
    availability: 'in_stock',
    sourceConfidence: 0.9
  });

  assert.equal(calls.length, 2);
  assert.match(calls[0].options.headers.Authorization, /^Basic /);
  assert.equal(calls[0].options.body.includes('client-secret'), false);
  assert.match(calls[1].options.headers.Authorization, /^Bearer app-token$/);
  assert.equal(calls[1].options.headers['X-EBAY-C-MARKETPLACE-ID'], 'EBAY_US');
  assert.match(calls[1].url, /item_summary\/search/);
  assert.match(calls[1].url, /Dell(?:%20|\+)Latitude(?:%20|\+)7420/);
});

test('eBay provider rejects missing credentials without making network calls', async () => {
  let called = false;
  const provider = createEbayBrowseProvider({
    clientId: '',
    clientSecret: '',
    fetchImpl: async () => {
      called = true;
      throw new Error('should not run');
    }
  });

  await assert.rejects(() => provider.searchOffers({ title: 'Laptop' }), /credentials/i);
  assert.equal(called, false);
});

test('eBay provider never returns non-USD or unsafe offers', async () => {
  let call = 0;
  const provider = createEbayBrowseProvider({
    clientId: 'id',
    clientSecret: 'secret',
    fetchImpl: async () => {
      call += 1;
      if (call === 1) {
        return new Response(JSON.stringify({ access_token: 'token', expires_in: 7200 }), { status: 200 });
      }
      return new Response(JSON.stringify({
        itemSummaries: [
          { itemId: 'bad-1', title: 'Bad Currency', itemWebUrl: 'https://www.ebay.com/itm/1', price: { value: '99', currency: 'EUR' } },
          { itemId: 'bad-2', title: 'Unsafe URL', itemWebUrl: 'javascript:alert(1)', price: { value: '99', currency: 'USD' } }
        ]
      }), { status: 200 });
    }
  });

  const offers = await provider.searchOffers({ title: 'Laptop' });
  assert.deepEqual(offers, []);
});
