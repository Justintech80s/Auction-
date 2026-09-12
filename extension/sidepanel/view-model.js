const DECISIONS = new Set([
  'strong_buy',
  'buy',
  'fair',
  'overpriced',
  'avoid',
  'manual_review'
]);

function finiteNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function normalizeRange(range) {
  if (!range || typeof range !== 'object') return null;
  const low = finiteNumber(range.low);
  const high = finiteNumber(range.high);
  if (low === null || high === null) return null;
  return Object.freeze({ low, high });
}

function normalizedDecision(opportunity) {
  const decision = String(opportunity?.decision || '').trim();
  return DECISIONS.has(decision) ? decision : null;
}

function normalizedReason(opportunity) {
  const reason = String(opportunity?.reason || '').trim();
  return reason || null;
}

function riskState(security) {
  const decision = String(security?.decision || '').trim();
  return decision || 'unknown';
}

function soldEvidenceState(soldEvidence) {
  const status = String(soldEvidence?.status || '').trim();
  return status || 'not_configured';
}

export function buildAnalysisViewModel(analysis = {}, product = {}) {
  const valuation = analysis?.valuation || {};
  const opportunity = analysis?.opportunity;
  const soldEvidence = analysis?.soldEvidence || {};

  const verifiedSoldCount = Number.isFinite(Number(soldEvidence.verifiedCount))
    ? Number(soldEvidence.verifiedCount)
    : Number.isFinite(Number(valuation.verifiedSoldCount))
      ? Number(valuation.verifiedSoldCount)
      : 0;

  return Object.freeze({
    productTitle: String(product?.title || '').trim() || 'Unknown product',
    currentPrice: finiteNumber(product?.price),
    currency: String(product?.currency || 'USD').trim().toUpperCase() || 'USD',
    estimatedValue: finiteNumber(valuation?.estimate),
    valueRange: normalizeRange(valuation?.range),
    verifiedSoldCount,
    potentialProfit: opportunity ? finiteNumber(opportunity.expectedProfit) : null,
    confidence: finiteNumber(valuation?.confidence) ?? 0,
    decision: normalizedDecision(opportunity),
    decisionReason: normalizedReason(opportunity),
    riskState: riskState(analysis?.security),
    soldEvidenceState: soldEvidenceState(soldEvidence)
  });
}
