import test from 'node:test';
import assert from 'node:assert/strict';
import { matchOffer } from '../src/product-search/matcher.js';
import { dellIdentity, dellOffer } from './helpers/product-search-fixtures.js';

test('classifies matching identifier, model, and material specs as exact', () => {
  const result = matchOffer(dellIdentity(), dellOffer());
  assert.equal(result.classification, 'exact');
  assert.ok(result.score >= 0.9);
});

test('rejects conflicting laptop RAM or storage configurations', () => {
  const ramConflict = matchOffer(dellIdentity(), dellOffer({
    specs: { ram: '8GB', storage: '512GB SSD', screenSize: '14 inch' }
  }));
  const storageConflict = matchOffer(dellIdentity(), dellOffer({
    specs: { ram: '16GB', storage: '256GB SSD', screenSize: '14 inch' }
  }));
  assert.equal(ramConflict.classification, 'rejected');
  assert.equal(storageConflict.classification, 'rejected');
});

test('rejects accessories, replacement parts, and empty boxes', () => {
  for (const title of [
    'Replacement keyboard for Dell Latitude 7420',
    'Dell Latitude 7420 charger power adapter',
    'Dell Latitude 7420 empty box only',
    'For parts accessory for Dell Latitude 7420'
  ]) {
    const result = matchOffer(dellIdentity(), dellOffer({ title }));
    assert.equal(result.classification, 'rejected', title);
  }
});

test('missing a material spec is similar rather than silently exact', () => {
  const result = matchOffer(dellIdentity(), dellOffer({
    specs: { ram: '16GB', screenSize: '14 inch' }
  }));
  assert.equal(result.classification, 'similar');
  assert.ok(result.score > 0.5);
});

test('rejects conflicting shared strong identifiers', () => {
  const result = matchOffer(dellIdentity(), dellOffer({
    identifiers: { mpn: 'LAT7410' },
    model: 'Latitude 7410',
    title: 'Dell Latitude 7410 16GB 512GB SSD'
  }));
  assert.equal(result.classification, 'rejected');
  assert.ok(result.reasons.some(reason => reason.includes('identifier')));
});

test('without a shared strong identifier, exact matching requires brand and model agreement', () => {
  const identity = dellIdentity({ identifiers: {} });
  const exact = matchOffer(identity, dellOffer({ identifiers: {} }));
  const wrongBrand = matchOffer(identity, dellOffer({ identifiers: {}, brand: 'HP' }));
  assert.equal(exact.classification, 'exact');
  assert.equal(wrongBrand.classification, 'rejected');
});
