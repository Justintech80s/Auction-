import test from 'node:test';
import assert from 'node:assert/strict';
import { valueItem } from '../src/pipeline.js';

const ITEM = { brand: 'Acme', model: 'X100', category: 'Camera' };

function askingComparables() {
  return [
    { source: 'market', sourceId: 'a1', title: 'Acme X100 Camera', price: 118, currency: 'USD', status: 'active' },
    { source: 'market', sourceId: 'a2', title: 'Acme X100 Camera Kit', price: 122, currency: 'USD', status: 'active' },
    { source: 'market', sourceId: 'a3', title: 'Acme X100 Camera Body', price: 120, currency: 'USD', status: 'active' }
  ];
}

function verifiedSoldRecord(id, price, soldAt = '2026-09-01T12:00:00.000Z') {
  return {
    source: 'fixture_market',
    sourceId: id,
    title: 'Acme X100 Camera',
    soldPrice: price,
    price,
    currency: 'USD',
    soldAt,
    verification: 'verified_sale',
    provenance: { provider: 'fixture_market' },
    status: 'sold',
    evidenceType: 'sold'
  };
}

function provider(records, name = 'fixture_market') {
  return {
    name,
    async searchSoldEvidence() {
      return structuredClone(records);
    }
  };
}

test('pipeline fetches, verifies, merges, and reports verified sold evidence', async () => {
  const result = await valueItem(ITEM, {
    search: async () => askingComparables(),
    soldEvidenceProvider: provider([
      verifiedSoldRecord('s1', 100),
      verifiedSoldRecord('s2', 105)
    ]),
    soldEvidenceOptions: { now: new Date('2026-09-03T12:00:00.000Z') }
  });

  assert.equal(result.soldEvidence.status, 'ok');
  assert.equal(result.soldEvidence.provider, 'fixture_market');
  assert.equal(result.soldEvidence.count, 2);
  assert.equal(result.soldEvidence.verifiedCount, 2);
  assert.equal(result.soldEvidence.risk.decision, 'allow');
  assert.equal(result.valuation.verifiedSoldCount, 2);
  assert.equal(result.comparables.filter((entry) => entry.evidenceType === 'sold').length, 2);
  assert.equal(result.comparables.filter((entry) => entry.evidenceType === 'asking').length, 3);
});

test('pipeline explicitly reports when no sold provider is configured without changing legacy valuation', async () => {
  const result = await valueItem(ITEM, {
    search: async () => askingComparables()
  });

  assert.equal(result.soldEvidence.status, 'not_configured');
  assert.equal(result.soldEvidence.provider, null);
  assert.equal(result.soldEvidence.count, 0);
  assert.equal(result.valuation.status, 'ok');
  assert.equal(result.valuation.verifiedSoldCount, 0);
});

test('sold provider failure falls back to asking evidence instead of failing valuation', async () => {
  const result = await valueItem(ITEM, {
    search: async () => askingComparables(),
    soldEvidenceProvider: {
      name: 'broken_provider',
      async searchSoldEvidence() {
        throw new Error('upstream secret failure detail');
      }
    }
  });

  assert.equal(result.soldEvidence.status, 'unavailable');
  assert.equal(result.soldEvidence.provider, 'broken_provider');
  assert.equal(result.soldEvidence.count, 0);
  assert.equal(result.valuation.status, 'ok');
  assert.equal(result.valuation.verifiedSoldCount, 0);
});

test('freshness review from sold evidence Guardian forces opportunity manual review', async () => {
  const result = await valueItem(ITEM, {
    search: async () => askingComparables(),
    soldEvidenceProvider: provider([
      verifiedSoldRecord('old-sale', 100, '2025-01-01T12:00:00.000Z')
    ]),
    soldEvidenceOptions: {
      now: new Date('2026-09-03T12:00:00.000Z'),
      maxAgeDays: 90
    },
    requireFreshSoldEvidence: true,
    acquisitionPrice: 60
  });

  assert.equal(result.soldEvidence.risk.decision, 'review');
  assert.equal(result.opportunity.decision, 'manual_review');
});
