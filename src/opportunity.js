function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function soldEvidenceGate(soldEvidence) {
  if (soldEvidence == null) {
    return { requested: false, passed: true, riskDecision: 'allow' };
  }

  const verifiedCount = Math.max(0, finite(soldEvidence.verifiedCount, 0));
  const quality = Math.max(0, Math.min(1, finite(soldEvidence.quality, 0)));
  const riskDecision = soldEvidence?.risk?.decision || 'allow';
  const available = soldEvidence.status === 'ok';

  return {
    requested: true,
    passed: available && verifiedCount > 0 && quality > 0 && riskDecision === 'allow',
    riskDecision
  };
}

export function evaluateOpportunity({
  acquisitionPrice,
  valuation = {},
  security = { decision: 'allow' },
  soldEvidence,
  targetMarginPct = 25
} = {}) {
  const price = Number(acquisitionPrice);
  if (!Number.isFinite(price) || price < 0) {
    throw new Error('evaluateOpportunity requires a valid acquisitionPrice');
  }

  const estimate = finite(valuation.estimate ?? valuation.mid ?? valuation.value);
  if (estimate <= 0) {
    throw new Error('evaluateOpportunity requires a positive valuation estimate');
  }

  const confidence = Math.max(0, Math.min(1, finite(valuation.confidence, 0)));
  const low = Math.max(0, finite(valuation.low ?? valuation.range?.low, estimate));
  const high = Math.max(low, finite(valuation.high ?? valuation.range?.high, estimate));
  const targetMargin = Math.max(0, Math.min(90, finite(targetMarginPct, 25))) / 100;
  const soldGate = soldEvidenceGate(soldEvidence);

  const expectedProfit = estimate - price;
  const expectedMarginPct = estimate ? (expectedProfit / estimate) * 100 : 0;
  const discountPct = ((estimate - price) / estimate) * 100;
  const confidenceAdjustedValue = low * confidence;
  const maxRecommendedBid = confidenceAdjustedValue * (1 - targetMargin);

  const priceSignal = Math.max(0, Math.min(100, 50 + discountPct));
  const opportunityScore = round((priceSignal * 0.65) + (confidence * 100 * 0.35));

  let decision;
  if (
    security?.decision === 'review'
    || security?.decision === 'reject'
    || soldGate.riskDecision === 'review'
    || soldGate.riskDecision === 'reject'
  ) {
    decision = 'manual_review';
  } else if (price > high || expectedMarginPct < -10) {
    decision = 'avoid';
  } else if (price > estimate) {
    decision = 'overpriced';
  } else if (
    opportunityScore >= 80
    && expectedMarginPct >= 35
    && confidence >= 0.75
    && soldGate.passed
  ) {
    decision = 'strong_buy';
  } else if (opportunityScore >= 65 && expectedMarginPct >= 20 && confidence >= 0.55) {
    decision = 'buy';
  } else {
    decision = 'fair';
  }

  return {
    decision,
    acquisitionPrice: round(price),
    estimatedValue: round(estimate),
    valuationRange: { low: round(low), high: round(high) },
    confidence: round(confidence, 4),
    expectedProfit: round(expectedProfit),
    expectedMarginPct: round(expectedMarginPct),
    discountPct: round(discountPct),
    maxRecommendedBid: round(maxRecommendedBid),
    opportunityScore,
    targetMarginPct: round(targetMargin * 100),
    securityDecision: security?.decision || 'allow',
    soldEvidenceGateRequested: soldGate.requested,
    soldEvidenceGatePassed: soldGate.requested ? soldGate.passed : null
  };
}
