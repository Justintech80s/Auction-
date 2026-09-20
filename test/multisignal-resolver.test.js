import test from 'node:test';
import assert from 'node:assert/strict';
import { filenameClues, barcodeClues, resolveSignals, weightedMatchSignals } from '../src/product-search/multisignal-resolver.js';

test('generic image filenames never become product identities', () => {
  assert.equal(filenameClues('images.jpg'), null);
  assert.equal(filenameClues('IMG_1234.webp'), null);
});

test('descriptive filenames can provide a weak fallback clue', () => {
  assert.equal(filenameClues('dove-beauty-cream-bar.webp'), 'dove beauty cream bar');
});

test('barcode clues extract common retail identifiers', () => {
  assert.deepEqual(barcodeClues('UPC 011111611025 other 123'), ['011111611025']);
});

test('resolver prefers supplied evidence over filenames', () => {
  const result = resolveSignals({ evidence: { title: 'Dove Beauty Cream Bar', brand: 'Dove' }, fileName: 'images.jpg' });
  assert.equal(result.title, 'Dove Beauty Cream Bar');
  assert.equal(result.resolverSignals.filename, false);
});

test('exact identifiers dominate weighted matching', () => {
  assert.equal(weightedMatchSignals({ identifiers: { upc: '011111611025' } }, { identifiers: { gtin: '011111611025' } }), 1);
});
