import test from 'node:test';
import assert from 'node:assert/strict';
import { ebayAdapter } from '../extension/adapters/ebay.js';
import { amazonAdapter } from '../extension/adapters/amazon.js';
import { walmartAdapter } from '../extension/adapters/walmart.js';
import { bestBuyAdapter } from '../extension/adapters/bestbuy.js';
import { genericAdapter } from '../extension/adapters/generic.js';

function node({ textContent = '', attrs = {} } = {}) {
  return {
    textContent,
    getAttribute(name) { return attrs[name] ?? null; }
  };
}

function fakeDocument(entries = {}, jsonLd = []) {
  const values = new Map(Object.entries(entries));
  return {
    querySelector(selector) {
      const value = values.get(selector);
      return Array.isArray(value) ? value[0] ?? null : value ?? null;
    },
    querySelectorAll(selector) {
      if (selector === 'script[type="application/ld+json"]') {
        return jsonLd.map((value) => node({ textContent: JSON.stringify(value) }));
      }
      const value = values.get(selector);
      if (Array.isArray(value)) return value;
      return value ? [value] : [];
    }
  };
}

const context = { now: new Date('2026-09-12T12:00:00Z') };

const cases = [
  {
    name: 'eBay',
    adapter: ebayAdapter,
    url: 'https://www.ebay.com/itm/123',
    documentLike: fakeDocument({
      'h1.x-item-title__mainTitle span': node({ textContent: 'Sony WM-2 Walkman' }),
      '[itemprop="price"]': node({ attrs: { content: '129.99' } }),
      '[itemprop="priceCurrency"]': node({ attrs: { content: 'USD' } }),
      '[itemprop="brand"]': node({ attrs: { content: 'Sony' } })
    })
  },
  {
    name: 'Amazon',
    adapter: amazonAdapter,
    url: 'https://www.amazon.com/dp/B000123456',
    documentLike: fakeDocument({
      '#productTitle': node({ textContent: 'Sony WM-2 Walkman' }),
      'meta[itemprop="price"]': node({ attrs: { content: '129.99' } }),
      'meta[itemprop="priceCurrency"]': node({ attrs: { content: 'USD' } }),
      '#bylineInfo': node({ textContent: 'Brand: Sony' })
    })
  },
  {
    name: 'Walmart',
    adapter: walmartAdapter,
    url: 'https://www.walmart.com/ip/123456',
    documentLike: fakeDocument({}, [{
      '@type': 'Product',
      name: 'Sony WM-2 Walkman',
      brand: { name: 'Sony' },
      offers: { price: '129.99', priceCurrency: 'USD' }
    }])
  },
  {
    name: 'Best Buy',
    adapter: bestBuyAdapter,
    url: 'https://www.bestbuy.com/site/example/123.p',
    documentLike: fakeDocument({
      'h1.heading-5': node({ textContent: 'Sony WM-2 Walkman' }),
      'meta[itemprop="price"]': node({ attrs: { content: '129.99' } }),
      'meta[itemprop="priceCurrency"]': node({ attrs: { content: 'USD' } })
    })
  }
];

for (const sample of cases) {
  test(`${sample.name} adapter returns normalized product data`, () => {
    assert.equal(sample.adapter.matches(sample.url, sample.documentLike), true);
    const product = sample.adapter.extract(sample.documentLike, { ...context, url: sample.url });
    assert.equal(product.title, 'Sony WM-2 Walkman');
    assert.equal(product.price, 129.99);
    assert.equal(product.currency, 'USD');
    assert.equal(product.url, sample.url);
  });
}

test('generic adapter prefers Product JSON-LD and normalizes it', () => {
  const url = 'https://shop.example.com/products/wm2';
  const doc = fakeDocument({}, [{
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: 'Sony WM-2 Walkman',
    brand: { '@type': 'Brand', name: 'Sony' },
    sku: 'WM2-001',
    offers: { '@type': 'Offer', price: '149.50', priceCurrency: 'USD', itemCondition: 'UsedCondition' }
  }]);

  const product = genericAdapter.extract(doc, { ...context, url });
  assert.equal(product.source, 'generic');
  assert.equal(product.price, 149.5);
  assert.equal(product.brand, 'Sony');
  assert.equal(product.identifiers.sku, 'WM2-001');
});

test('generic adapter can use OpenGraph product metadata', () => {
  const url = 'https://shop.example.com/products/wm2';
  const doc = fakeDocument({
    'meta[property="og:type"]': node({ attrs: { content: 'product' } }),
    'meta[property="og:title"]': node({ attrs: { content: 'Sony WM-2 Walkman' } }),
    'meta[property="product:price:amount"]': node({ attrs: { content: '159.99' } }),
    'meta[property="product:price:currency"]': node({ attrs: { content: 'USD' } })
  });

  const product = genericAdapter.extract(doc, { ...context, url });
  assert.equal(product.title, 'Sony WM-2 Walkman');
  assert.equal(product.price, 159.99);
});

test('adapters return null on ambiguous non-product pages', () => {
  const empty = fakeDocument();
  assert.equal(ebayAdapter.extract(empty, { ...context, url: 'https://www.ebay.com/sch/i.html?_nkw=walkman' }), null);
  assert.equal(amazonAdapter.extract(empty, { ...context, url: 'https://www.amazon.com/s?k=walkman' }), null);
  assert.equal(genericAdapter.extract(empty, { ...context, url: 'https://example.com/about' }), null);
});
