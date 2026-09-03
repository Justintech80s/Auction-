import test from 'node:test';
import assert from 'node:assert/strict';
import { createSoldEvidenceRegistry } from '../src/sold-evidence/registry.js';
import { createFixtureSoldProvider } from '../src/sold-evidence/providers/fixture.js';
import { mergeMarketEvidence } from '../src/sold-evidence/merge.js';

test('registry validates providers and rejects unknown names', () => {
  const registry = createSoldEvidenceRegistry({ fixture: createFixtureSoldProvider([]) });
  assert.throws(() => registry.get('missing'), /Unknown sold evidence provider/);
  assert.equal(typeof registry.get('fixture').searchSoldEvidence, 'function');
});

test('fixture provider returns a defensive deterministic copy', async () => {
  const sourceRecords = [{ source: 'fixture', sourceId: '1', soldPrice: 100 }];
  const provider = createFixtureSoldProvider(sourceRecords);
  const first = await provider.searchSoldEvidence('camera');
  const second = await provider.searchSoldEvidence('camera');

  assert.deepEqual(first, sourceRecords);
  assert.deepEqual(second, sourceRecords);
  assert.notEqual(first, second);
  first[0].soldPrice = 1;
  assert.equal(second[0].soldPrice, 100);
});

test('registry register validates new providers', () => {
  const registry = createSoldEvidenceRegistry();
  assert.throws(() => registry.register('broken', {}), /searchSoldEvidence/);
  registry.register('fixture', createFixtureSoldProvider([]));
  assert.deepEqual(registry.list(), ['fixture']);
});

test('merge keeps asking and sold evidence distinct and removes duplicate sold ids', () => {
  const asking = [{ source: 'ebay', sourceId: 'a1', status: 'active', evidenceType: 'asking', price: 90 }];
  const sold = [
    { source: 'fixture', sourceId: 's1', status: 'sold', evidenceType: 'sold', price: 100, verification: 'verified_sale' },
    { source: 'fixture', sourceId: 's1', status: 'sold', evidenceType: 'sold', price: 100, verification: 'verified_sale' }
  ];

  const merged = mergeMarketEvidence(asking, sold);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].evidenceType, 'asking');
  assert.equal(merged[1].evidenceType, 'sold');
  assert.equal(merged[1].verification, 'verified_sale');
});

test('merge does not relabel active evidence as sold', () => {
  const asking = [{ source: 'ebay', sourceId: 'a2', status: 'active', evidenceType: 'asking', price: 75 }];
  const merged = mergeMarketEvidence(asking, []);
  assert.equal(merged[0].status, 'active');
  assert.equal(merged[0].evidenceType, 'asking');
});
