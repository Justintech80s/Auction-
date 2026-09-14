import test from 'node:test';
import assert from 'node:assert/strict';
import { identifyProduct } from '../src/product-search/identify.js';
import { dellEvidence } from './helpers/product-search-fixtures.js';

test('accepts strong page evidence without calling visual provider', async () => {
  let calls = 0;
  const result = await identifyProduct(
    dellEvidence({ confidence: 0.91, identifiers: { mpn: 'LAT7420' } }),
    {
      visualProvider: {
        name: 'visual',
        async identifyProduct() {
          calls += 1;
          return {};
        }
      }
    }
  );

  assert.equal(result.status, 'identified');
  assert.equal(result.identity.model, 'Latitude 7420');
  assert.equal(calls, 0);
});

test('uses visual provider only when page evidence is weak and an image exists', async () => {
  const result = await identifyProduct(
    dellEvidence({ confidence: 0.42, model: null, identifiers: {} }),
    {
      visualProvider: {
        name: 'visual',
        async identifyProduct() {
          return {
            title: 'Dell Latitude 7420',
            brand: 'Dell',
            model: 'Latitude 7420',
            category: 'Laptop',
            condition: 'used',
            identifiers: { mpn: 'LAT7420' },
            specs: { ram: '16GB', storage: '512GB SSD' },
            confidence: 0.88
          };
        }
      }
    }
  );

  assert.equal(result.status, 'identified');
  assert.equal(result.identity.model, 'Latitude 7420');
  assert.equal(result.identity.sourceUrl.includes('google.com'), true);
});

test('weak evidence without a configured visual provider requires confirmation', async () => {
  const result = await identifyProduct(
    dellEvidence({ confidence: 0.42, model: null, identifiers: {} })
  );
  assert.equal(result.status, 'needs_confirmation');
});

test('visual provider failures do not leak upstream errors', async () => {
  const result = await identifyProduct(
    dellEvidence({ confidence: 0.42, model: null, identifiers: {} }),
    {
      visualProvider: {
        name: 'visual',
        async identifyProduct() {
          throw new Error('secret token=abc123');
        }
      }
    }
  );
  assert.deepEqual(result.status, 'needs_confirmation');
  assert.equal(JSON.stringify(result).includes('abc123'), false);
});
