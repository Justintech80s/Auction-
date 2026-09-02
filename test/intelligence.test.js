import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSearchQuery, scoreComparable, rankComparables } from '../src/intelligence.js';

test('buildSearchQuery combines the strongest known item attributes', () => {
  assert.equal(buildSearchQuery({ brand: 'Sony', model: 'WM-2', category: 'Walkman', year: '1981' }), 'Sony WM-2 Walkman 1981');
});

test('scoreComparable rewards exact brand and model matches', () => {
  const score = scoreComparable(
    { brand: 'Sony', model: 'WM-2', category: 'Walkman' },
    { title: 'Sony WM-2 Walkman Stereo Cassette Player', condition: 'Used' }
  );
  assert.ok(score >= 0.8);
});

test('scoreComparable penalizes conflicting model identifiers', () => {
  const exact = scoreComparable(
    { brand: 'Sony', model: 'WM-2', category: 'Walkman' },
    { title: 'Sony WM-2 Walkman Stereo Cassette Player' }
  );
  const wrongModel = scoreComparable(
    { brand: 'Sony', model: 'WM-2', category: 'Walkman' },
    { title: 'Sony WM-10 Walkman Stereo Cassette Player' }
  );
  assert.ok(exact > wrongModel);
  assert.ok(wrongModel < 0.7);
});

test('rankComparables orders the best matches first and attaches similarity', () => {
  const ranked = rankComparables(
    { brand: 'Nintendo', model: 'DMG-01', category: 'Game Boy' },
    [
      { sourceId: 'a', title: 'Nintendo Switch OLED Console' },
      { sourceId: 'b', title: 'Nintendo DMG-01 Original Game Boy Handheld' }
    ]
  );
  assert.equal(ranked[0].sourceId, 'b');
  assert.ok(ranked[0].similarity > ranked[1].similarity);
});
