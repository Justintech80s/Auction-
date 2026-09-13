import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAnalysisViewModel } from '../extension/sidepanel/view-model.js';

const product = {
  title: 'Sony WM-2 Walkman',
  price: 120,
  currency: 'USD'
};

function analysis(overrides = {}) {
  return {
    status: 'ok',
    valuation: {
      status: 'ok',
      estimate: 200,
      range: { low: 180, high: 220 },
      confidence: 0.82,
      verifiedSoldCount: 3
    },
    opportunity: {
      decision: 'buy',
      reason: 'Priced below estimated value.',
      expectedProfit: 80
    },
    soldEvidence: {
      status: 'ok',
      verifiedCount: 3
    },
    security: {
      decision: 'allow',
      riskBand: 'low'
    },
    ...overrides
  };
}

test('maps Auction analysis into stable display fields', () => {
  const vm = buildAnalysisViewModel(analysis(), product);
  assert.deepEqual(vm, {
    productTitle: 'Sony WM-2 Walkman',
    currentPrice: 120,
    currency: 'USD',
    estimatedValue: 200,
    valueRange: { low: 180, high: 220 },
    verifiedSoldCount: 3,
    potentialProfit: 80,
    confidence: 0.82,
    decision: 'buy',
    decisionReason: 'Priced below estimated value.',
    riskState: 'allow',
    soldEvidenceState: 'ok'
  });
});

for (const decision of ['strong_buy', 'buy', 'fair', 'overpriced', 'avoid', 'manual_review']) {
  test(`preserves Auction decision verbatim: ${decision}`, () => {
    const vm = buildAnalysisViewModel(analysis({
      opportunity: { decision, reason: `Reason for ${decision}`, expectedProfit: 10 }
    }), product);
    assert.equal(vm.decision, decision);
    assert.equal(vm.decisionReason, `Reason for ${decision}`);
  });
}

test('reports unavailable sold evidence without inventing verified sales', () => {
  const vm = buildAnalysisViewModel(analysis({
    soldEvidence: { status: 'unavailable', verifiedCount: 0 },
    valuation: {
      status: 'ok', estimate: 200, range: { low: 180, high: 220 }, confidence: 0.6, verifiedSoldCount: 0
    }
  }), product);
  assert.equal(vm.soldEvidenceState, 'unavailable');
  assert.equal(vm.verifiedSoldCount, 0);
});

test('handles missing valuation estimate conservatively', () => {
  const vm = buildAnalysisViewModel(analysis({
    valuation: {
      status: 'insufficient_evidence', estimate: null, range: null, confidence: 0, verifiedSoldCount: 0
    },
    opportunity: undefined
  }), product);
  assert.equal(vm.estimatedValue, null);
  assert.equal(vm.valueRange, null);
  assert.equal(vm.potentialProfit, null);
  assert.equal(vm.decision, null);
});

test('reflects Guardian review state and does not upgrade manual review', () => {
  const vm = buildAnalysisViewModel(analysis({
    opportunity: { decision: 'manual_review', reason: 'Guardian requires review.', expectedProfit: 80 },
    security: { decision: 'review', riskBand: 'medium' }
  }), product);
  assert.equal(vm.riskState, 'review');
  assert.equal(vm.decision, 'manual_review');
});
