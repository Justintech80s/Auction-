import test from 'node:test';
import assert from 'node:assert/strict';
import { assessSoldEvidenceRisk } from '../src/security/sold-evidence-risk.js';

function verifiedSale(overrides = {}) {
  return {
    source: 'fixture',
    sourceId: 'sale-1',
    soldPrice: 100,
    price: 100,
    currency: 'USD',
    soldAt: '2026-09-01T12:00:00.000Z',
    verification: 'verified_sale',
    provenance: { provider: 'fixture' },
    freshness: { ageDays: 2, stale: false },
    status: 'sold',
    evidenceType: 'sold',
    ...overrides
  };
}

test('clean verified sold evidence is allowed', () => {
  const result = assessSoldEvidenceRisk([verifiedSale()], {
    now: new Date('2026-09-03T12:00:00.000Z')
  });

  assert.equal(result.decision, 'allow');
  assert.equal(result.riskBand, 'low');
  assert.equal(result.accepted.length, 1);
  assert.equal(result.rejected.length, 0);
});

test('duplicate sold ids trigger review and duplicate rejection', () => {
  const result = assessSoldEvidenceRisk([
    verifiedSale(),
    verifiedSale({ soldPrice: 110, price: 110 })
  ], { now: new Date('2026-09-03T12:00:00.000Z') });

  assert.equal(result.decision, 'review');
  assert.ok(result.signals.some((signal) => signal.code === 'duplicate_sold_id'));
  assert.equal(result.accepted.length, 1);
  assert.equal(result.rejected.length, 1);
});

test('future sold timestamps are rejected', () => {
  const result = assessSoldEvidenceRisk([
    verifiedSale({ soldAt: '2026-09-04T12:00:00.000Z' })
  ], { now: new Date('2026-09-03T12:00:00.000Z') });

  assert.equal(result.decision, 'reject');
  assert.ok(result.signals.some((signal) => signal.code === 'future_sold_timestamp'));
  assert.equal(result.rejected.length, 1);
});

test('unverified sale claims cannot masquerade as verified market sales', () => {
  const result = assessSoldEvidenceRisk([
    verifiedSale({ verification: 'unverified_sale_claim', provenance: { provider: 'fixture', verified: true } })
  ], { now: new Date('2026-09-03T12:00:00.000Z') });

  assert.equal(result.decision, 'review');
  assert.ok(result.signals.some((signal) => signal.code === 'verification_mismatch'));
});

test('stale evidence triggers review when fresh evidence is required', () => {
  const result = assessSoldEvidenceRisk([
    verifiedSale({
      soldAt: '2025-01-01T12:00:00.000Z',
      freshness: { ageDays: 610, stale: true }
    })
  ], {
    now: new Date('2026-09-03T12:00:00.000Z'),
    requireFresh: true,
    maxAgeDays: 180
  });

  assert.equal(result.decision, 'review');
  assert.ok(result.signals.some((signal) => signal.code === 'stale_sold_evidence'));
});

test('malformed provenance is rejected from the accepted evidence set', () => {
  const result = assessSoldEvidenceRisk([
    verifiedSale({ provenance: null })
  ], { now: new Date('2026-09-03T12:00:00.000Z') });

  assert.equal(result.decision, 'review');
  assert.ok(result.signals.some((signal) => signal.code === 'malformed_provenance'));
  assert.equal(result.accepted.length, 0);
  assert.equal(result.rejected.length, 1);
});
