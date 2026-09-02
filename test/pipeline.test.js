import test from 'node:test';
import assert from 'node:assert/strict';
import { valueItem } from '../src/pipeline.js';

test('valueItem runs query, marketplace evidence, ranking, and valuation as one pipeline', async () => {
  let receivedQuery;
  const search = async (query) => {
    receivedQuery = query;
    return [
      { source: 'fixture', sourceId: '1', title: 'Sony WM-2 Walkman Cassette Player', price: 100, currency: 'USD', status: 'sold' },
      { source: 'fixture', sourceId: '2', title: 'Sony WM-2 Walkman Stereo Player', price: 110, currency: 'USD', status: 'sold' },
      { source: 'fixture', sourceId: '3', title: 'Unrelated Sony Television', price: 900, currency: 'USD', status: 'active' }
    ];
  };

  const result = await valueItem(
    { brand: 'Sony', model: 'WM-2', category: 'Walkman' },
    { source: 'fixture', search }
  );

  assert.equal(receivedQuery, 'Sony WM-2 Walkman');
  assert.equal(result.query, 'Sony WM-2 Walkman');
  assert.equal(result.source, 'fixture');
  assert.equal(result.valuation.status, 'ok');
  assert.ok(result.valuation.estimate >= 100 && result.valuation.estimate <= 110);
  assert.equal(result.comparables.length, 2);
  assert.ok(result.comparables.every((item) => item.similarity >= 0.5));
});

test('valueItem returns insufficient evidence when marketplace matches are weak', async () => {
  const result = await valueItem(
    { brand: 'Nintendo', model: 'DMG-01', category: 'Game Boy' },
    {
      source: 'fixture',
      search: async () => [
        { source: 'fixture', sourceId: '1', title: 'Nintendo Switch OLED', price: 300, currency: 'USD', status: 'active' },
        { source: 'fixture', sourceId: '2', title: 'PlayStation 5 Console', price: 450, currency: 'USD', status: 'active' }
      ]
    }
  );

  assert.equal(result.valuation.status, 'insufficient_evidence');
  assert.equal(result.comparables.length, 0);
});

test('valueItem rejects an empty item query before marketplace search', async () => {
  await assert.rejects(
    () => valueItem({}, { source: 'fixture', search: async () => [] }),
    /searchable item attributes/
  );
});
