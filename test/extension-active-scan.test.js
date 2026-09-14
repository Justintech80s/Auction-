import test from 'node:test';
import assert from 'node:assert/strict';
import { collectActiveProductEvidence } from '../extension/content/active-scan.js';
import { fakeScanDocument } from './helpers/active-scan-dom.js';

test('prefers Product JSON-LD on a product page', () => {
  const documentLike = fakeScanDocument({
    title: 'Dell Latitude 7420',
    jsonLd: [{
      '@type': 'Product',
      name: 'Dell Latitude 7420',
      brand: { name: 'Dell' },
      model: 'Latitude 7420',
      sku: 'LAT7420',
      image: 'https://images.example/dell.jpg'
    }]
  });

  const result = collectActiveProductEvidence({
    documentLike,
    locationLike: { href: 'https://shop.example/dell' },
    now: '2026-09-14T12:00:00Z'
  });

  assert.equal(result.model, 'Latitude 7420');
  assert.equal(result.identifiers.sku, 'LAT7420');
  assert.ok(result.evidenceKinds.includes('structured_product'));
  assert.ok(result.confidence >= 0.9);
});

test('captures image and bounded title from an image-results page', () => {
  const documentLike = fakeScanDocument({
    title: 'Dell Latitude 7420 - Images',
    selectors: {
      'meta[property="og:title"]': { content: 'Dell Latitude 7420' },
      'meta[property="og:image"]': { content: 'https://images.example/dell.jpg' }
    }
  });

  const result = collectActiveProductEvidence({
    documentLike,
    locationLike: { href: 'https://www.google.com/search?q=dell+7420&tbm=isch' },
    now: '2026-09-14T12:00:00Z'
  });

  assert.equal(result.imageUrl, 'https://images.example/dell.jpg');
  assert.equal(result.title, 'Dell Latitude 7420');
  assert.ok(result.confidence > 0);
  assert.ok(result.evidenceKinds.includes('primary_image'));
});

test('does not read arbitrary body, forms, cookies, or payment fields', () => {
  const documentLike = fakeScanDocument({ title: 'Product page 4111111111111111' });
  documentLike.body = { innerText: 'PRIVATE MESSAGE session=secret' };
  documentLike.cookie = 'session=secret';
  documentLike.forms = [{ cardNumber: '4111111111111111' }];

  const result = collectActiveProductEvidence({
    documentLike,
    locationLike: { href: 'https://shop.example/item' },
    now: '2026-09-14T12:00:00Z'
  });

  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes('PRIVATE MESSAGE'), false);
  assert.equal(serialized.includes('session=secret'), false);
  assert.equal(serialized.includes('4111111111111111'), false);
  assert.equal('rawHtml' in result, false);
});
