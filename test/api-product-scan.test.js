import test from 'node:test';
import assert from 'node:assert/strict';
import { handleProductScan } from '../api/product-scan.js';

function exactFixtureProvider() {
  return {
    name: 'fixture',
    trustTier: 'trusted',
    async searchOffers() {
      return [{
        source: 'fixture', sourceId: 'offer-1', store: 'Fixture Store',
        title: 'Dell Latitude 7420 16GB 512GB SSD',
        url: 'https://shop.example/dell-7420', imageUrl: 'https://shop.example/dell.jpg',
        brand: 'Dell', model: 'Latitude 7420', category: 'Laptop', identifiers: {},
        specs: { ram: '16GB', storage: '512GB SSD' }, condition: 'used',
        itemPrice: 220, shipping: 15, currency: 'USD', availability: 'in_stock', sourceConfidence: 0.95
      }];
    }
  };
}

function exactFixturePayload() {
  return {
    action: 'product_scan',
    evidence: {
      title: 'Dell Latitude 7420', brand: 'Dell', model: 'Latitude 7420', category: 'Laptop',
      condition: 'used', specs: { ram: '16GB', storage: '512GB SSD' },
      sourceUrl: 'https://example.com/dell-7420', imageUrl: 'https://example.com/dell.jpg', confidence: 0.95
    }
  };
}

test('product scan rejects unsupported actions', async () => {
  const result = await handleProductScan({ action: 'other' });
  assert.equal(result.statusCode, 400);
  assert.equal(result.body.status, 'error');
});

test('product scan safely identifies bounded evidence and reports provider unavailable', async () => {
  const result = await handleProductScan({
    action: 'product_scan',
    source: 'browser_extension',
    evidence: {
      title: 'Dell Latitude 7420',
      brand: 'Dell',
      model: 'Latitude 7420',
      specs: { ram: '16GB', storage: '512GB SSD' },
      imageUrl: 'https://images.example/dell.jpg',
      sourceUrl: 'https://shop.example/item',
      confidence: 0.91,
      rawHtml: '<form>secret</form>',
      cookie: 'session=secret'
    }
  });

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.status, 'provider_unavailable');
  assert.equal(result.body.identifiedProduct.model, 'Latitude 7420');
  assert.deepEqual(result.body.identifiedProduct.features, ['ram: 16GB', 'storage: 512GB SSD']);
  assert.equal(result.body.lowestPrice, null);
  assert.deepEqual(result.body.priceComparison, []);
  assert.deepEqual(result.body.providerErrors, [{ source: 'shopping', code: 'provider_unavailable' }]);
  assert.equal(JSON.stringify(result.body).includes('secret'), false);
});

test('product scan requires a visible product title before claiming identification', async () => {
  const result = await handleProductScan({
    action: 'product_scan',
    evidence: {
      sourceUrl: 'https://shop.example/item',
      imageUrl: 'https://images.example/dell.jpg'
    }
  });

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.status, 'needs_confirmation');
  assert.equal(result.body.identifiedProduct, null);
  assert.equal(result.body.providerErrors.length, 0);
});

test('product scan removes non-https evidence URLs', async () => {
  const result = await handleProductScan({
    action: 'product_scan',
    evidence: {
      title: 'Safe Product',
      imageUrl: 'javascript:alert(1)',
      sourceUrl: 'http://unsafe.example/item'
    }
  });

  assert.equal(result.body.identifiedProduct.imageUrl, null);
  assert.equal(JSON.stringify(result.body).includes('unsafe.example'), false);
  assert.equal(JSON.stringify(result.body).includes('javascript:'), false);
});

test('product scan ranks safe exact provider offers and returns lowest delivered price', async () => {
  const result = await handleProductScan(exactFixturePayload(), { providers: [exactFixtureProvider()] });

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.status, 'complete');
  assert.equal(result.body.priceComparison.length, 1);
  assert.equal(result.body.priceComparison[0].price, 220);
  assert.equal(result.body.priceComparison[0].estimatedTotal, 235);
  assert.equal(result.body.lowestPrice.store, 'Fixture Store');
  assert.equal(result.body.lowestPrice.amount, 220);
  assert.equal(result.body.lowestPrice.shipping, 15);
  assert.equal(result.body.lowestPrice.estimatedTotal, 235);
  assert.equal(result.body.lowestPrice.url, 'https://shop.example/dell-7420');
  assert.deepEqual(result.body.providerErrors, []);
});

test('product scan persists each returned Guardian-approved exact offer', async () => {
  const persisted = [];
  const catalog = {
    async persistScanResult(records) {
      persisted.push(records);
      return { productId: 'p1', storeId: 's1', offerId: 'o1' };
    }
  };

  const result = await handleProductScan(exactFixturePayload(), {
    providers: [exactFixtureProvider()],
    catalog
  });

  assert.equal(result.body.status, 'complete');
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].offer.guardianDecision, 'allow');
  assert.equal(persisted[0].offer.matchClassification, 'exact');
  assert.equal(persisted[0].offer.itemPrice, 220);
  assert.equal(persisted[0].offer.purchaseUrl, 'https://shop.example/dell-7420');
});

test('database persistence failure never breaks or leaks into live scan results', async () => {
  const catalog = {
    async persistScanResult() {
      throw new Error('postgres password secret-db-host');
    }
  };

  const result = await handleProductScan(exactFixturePayload(), {
    providers: [exactFixtureProvider()],
    catalog
  });

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.status, 'complete');
  assert.equal(result.body.priceComparison.length, 1);
  assert.deepEqual(result.body.providerErrors, []);
  assert.doesNotMatch(JSON.stringify(result.body), /postgres|password|secret-db-host/i);
});
