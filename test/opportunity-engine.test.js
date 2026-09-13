import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateOpportunity } from '../src/opportunity.js';

test('labels a deeply discounted high-confidence item as strong_buy', () => {
  const result = evaluateOpportunity({
    acquisitionPrice: 60,
    valuation: { estimate: 120, low: 100, high: 140, confidence: 0.9 },
    security: { decision: 'allow' }
  });

  assert.equal(result.decision, 'strong_buy');
  assert.equal(result.expectedProfit, 60);
  assert.equal(result.expectedMarginPct, 50);
  assert.ok(result.opportunityScore >= 80);
});

test('returns avoid when acquisition price is materially above valuation', () => {
  const result = evaluateOpportunity({
    acquisitionPrice: 150,
    valuation: { estimate: 100, low: 90, high: 110, confidence: 0.9 },
    security: { decision: 'allow' }
  });

  assert.equal(result.decision, 'avoid');
  assert.ok(result.expectedProfit < 0);
});

test('forces manual_review when Guardian requires review or rejection', () => {
  for (const decision of ['review', 'reject']) {
    const result = evaluateOpportunity({
      acquisitionPrice: 40,
      valuation: { estimate: 120, low: 100, high: 140, confidence: 0.95 },
      security: { decision }
    });
    assert.equal(result.decision, 'manual_review');
  }
});

test('computes a confidence-adjusted maximum recommended bid', () => {
  const result = evaluateOpportunity({
    acquisitionPrice: 70,
    valuation: { estimate: 100, low: 80, high: 120, confidence: 0.75 },
    security: { decision: 'allow' },
    targetMarginPct: 25
  });

  // Conservative bid ceiling: downside valuation × confidence × retained value after target margin.
  assert.equal(result.maxRecommendedBid, 45);
  assert.equal(result.expectedProfit, 30);
});

test('rejects missing or invalid acquisition prices', () => {
  assert.throws(() => evaluateOpportunity({ valuation: { estimate: 100, confidence: 0.8 } }), /acquisitionPrice/);
  assert.throws(() => evaluateOpportunity({ acquisitionPrice: -1, valuation: { estimate: 100, confidence: 0.8 } }), /acquisitionPrice/);
});

test('sold evidence gate prevents strong_buy without verified sold authority', () => {
  const result = evaluateOpportunity({
    acquisitionPrice: 60,
    valuation: { estimate: 120, low: 100, high: 140, confidence: 0.9 },
    security: { decision: 'allow' },
    soldEvidence: {
      status: 'ok',
      verifiedCount: 0,
      quality: 0,
      risk: { decision: 'allow' }
    }
  });

  assert.notEqual(result.decision, 'strong_buy');
  assert.equal(result.soldEvidenceGateRequested, true);
  assert.equal(result.soldEvidenceGatePassed, false);
});

test('verified sold authority allows strong_buy when all other thresholds pass', () => {
  const result = evaluateOpportunity({
    acquisitionPrice: 60,
    valuation: { estimate: 120, low: 100, high: 140, confidence: 0.9 },
    security: { decision: 'allow' },
    soldEvidence: {
      status: 'ok',
      verifiedCount: 2,
      quality: 0.8,
      risk: { decision: 'allow' }
    }
  });

  assert.equal(result.decision, 'strong_buy');
  assert.equal(result.soldEvidenceGatePassed, true);
});

test('sold evidence Guardian review or reject forces manual_review', () => {
  for (const decision of ['review', 'reject']) {
    const result = evaluateOpportunity({
      acquisitionPrice: 40,
      valuation: { estimate: 120, low: 100, high: 140, confidence: 0.95 },
      security: { decision: 'allow' },
      soldEvidence: {
        status: 'ok',
        verifiedCount: 2,
        quality: 0.9,
        risk: { decision }
      }
    });

    assert.equal(result.decision, 'manual_review');
  }
});
