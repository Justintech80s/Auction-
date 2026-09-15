import test from 'node:test';
import assert from 'node:assert/strict';
import { handleProductScan } from '../api/product-scan.js';

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
