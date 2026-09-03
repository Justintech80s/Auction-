import test from 'node:test';
import assert from 'node:assert/strict';
import { createSoldEvidenceRegistry } from '../src/sold-evidence/registry.js';
import { createFixtureSoldProvider } from '../src/sold-evidence/providers/fixture.js';
import { mergeMarketEvidence } from '../src/sold-evidence/merge.js';

test('registry validates providers and rejects unknown names', async () => {
  const registry = createSoldEvidenceRegistry({ fixture: createFixtureSoldProvider([]) });
  assert.throws(() => registry.get('missing'), /Unknown sold evidence provider/);
  assert.equal(typeof registry.get('fixture').searchSoldEvidence, 'function');
});

test('fixture provider returns deterministic records', async () => {
  const provider = createFixtureSoldProvider([{ source: 'fixture', sourceId: '1' }]);
  assert.deepEqual(await provider.searchSoldEvidence('camera'), [{ source: 'fixture', sourceId: '1' }]);
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
