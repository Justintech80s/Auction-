import test from 'node:test';
import assert from 'node:assert/strict';
import { assertSoldEvidenceProvider } from '../src/sold-evidence/provider-contract.js';
import { normalizeSoldRecord } from '../src/sold-evidence/normalize.js';

test('provider contract requires searchSoldEvidence', () => {
  assert.throws(() => assertSoldEvidenceProvider({}), /searchSoldEvidence/);
  assert.doesNotThrow(() => assertSoldEvidenceProvider({ searchSoldEvidence: async () => [] }));
});

test('normalizer rejects missing source ids and non-positive prices', () => {
  const base = {
    source: 'fixture',
    sourceId: 'sale-1',
    title: 'Sony WM-2 Walkman',
    soldPrice: 100,
    currency: 'USD',
    soldAt: '2026-08-20T12:00:00Z',
    verification: 'verified_sale',
    provenance: { provider: 'fixture' }
  };

  assert.throws(() => normalizeSoldRecord({ ...base, sourceId: '' }), /sourceId/);
  assert.throws(() => normalizeSoldRecord({ ...base, soldPrice: 0 }), /soldPrice/);
});

test('normalizer rejects unsupported currencies', () => {
  assert.throws(() => normalizeSoldRecord({
    source: 'fixture', sourceId: 'sale-2', title: 'Camera', soldPrice: 100,
    currency: 'EUR', soldAt: '2026-08-20T12:00:00Z', verification: 'verified_sale',
    provenance: { provider: 'fixture' }
  }), /currency/);
});

test('normalizer rejects invalid and future sale timestamps', () => {
  const record = {
    source: 'fixture', sourceId: 'sale-3', title: 'Camera', soldPrice: 100,
    currency: 'USD', verification: 'verified_sale', provenance: { provider: 'fixture' }
  };

  assert.throws(() => normalizeSoldRecord({ ...record, soldAt: 'not-a-date' }), /soldAt/);
  assert.throws(() => normalizeSoldRecord({ ...record, soldAt: '2027-01-01T00:00:00Z' }, {
    now: new Date('2026-09-02T12:00:00Z')
  }), /future/);
});

test('normalizer returns bounded verified sold evidence with freshness metadata', () => {
  const result = normalizeSoldRecord({
    source: 'fixture',
    sourceId: 'sale-4',
    title: 'Sony WM-2 Walkman'.repeat(100),
    soldPrice: '125.50',
    currency: 'usd',
    soldAt: '2026-08-20T12:00:00Z',
    verification: 'verified_sale',
    provenance: { provider: 'fixture', batch: 'august' },
    url: 'https://example.com/sale/4',
    condition: 'Used'
  }, { now: new Date('2026-09-02T12:00:00Z') });

  assert.equal(result.sourceId, 'sale-4');
  assert.equal(result.soldPrice, 125.5);
  assert.equal(result.price, 125.5);
  assert.equal(result.currency, 'USD');
  assert.equal(result.status, 'sold');
  assert.equal(result.evidenceType, 'sold');
  assert.equal(result.verification, 'verified_sale');
  assert.equal(result.freshness.ageDays, 13);
  assert.ok(result.title.length <= 512);
});
