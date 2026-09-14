import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeCondition,
  normalizeOffer,
  normalizeProductIdentity,
  normalizeScanEvidence
} from '../src/product-search/contracts.js';
import {
  dellEvidence,
  dellIdentity,
  dellOffer
} from './helpers/product-search-fixtures.js';

test('normalizes condition without guessing open-box condition', () => {
  assert.equal(normalizeCondition('Brand New'), 'new');
  assert.equal(normalizeCondition('Certified Refurbished'), 'refurbished');
  assert.equal(normalizeCondition('Pre-Owned'), 'used');
  assert.equal(normalizeCondition('Open Box'), 'unknown');
});

test('normalizes a bounded product identity', () => {
  const identity = normalizeProductIdentity(dellIdentity(), {
    now: new Date('2026-09-14T12:00:00Z')
  });
  assert.equal(identity.model, 'Latitude 7420');
  assert.equal(identity.identifiers.mpn, 'LAT7420');
  assert.equal(identity.specs.ram, '16GB');
  assert.equal(identity.confidence, 0.94);
});

test('normalizes scan evidence without arbitrary fields', () => {
  const evidence = normalizeScanEvidence({
    ...dellEvidence(),
    rawHtml: '<form>secret</form>',
    cookie: 'session=secret'
  });
  assert.equal(evidence.model, 'Latitude 7420');
  assert.equal('rawHtml' in evidence, false);
  assert.equal('cookie' in evidence, false);
});

test('keeps unknown shipping unknown', () => {
  const offer = normalizeOffer(dellOffer({ shipping: null }));
  assert.equal(offer.shipping, null);
  assert.equal(offer.estimatedTotal, null);
});

test('computes total only when shipping is known', () => {
  const offer = normalizeOffer(dellOffer({ itemPrice: 220, shipping: 15 }));
  assert.equal(offer.estimatedTotal, 235);
});
