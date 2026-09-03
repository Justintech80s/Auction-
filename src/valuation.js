export function classifyEvidence(listing) {
  return String(listing?.status || '').toLowerCase() === 'sold' ? 'sold' : 'asking';
}

export function normalizePrice(value, currency = 'USD') {
  if (String(currency || 'USD').toUpperCase() !== 'USD') return null;
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null;
  if (typeof value !== 'string') return null;
  const normalized = Number(value.replace(/[$,\s]/g, ''));
  return Number.isFinite(normalized) && normalized > 0 ? normalized : null;
}

export function dedupeComparables(comparables) {
  const seen = new Set();
  const result = [];
  for (const item of comparables || []) {
    const key = `${item?.source ?? ''}:${item?.sourceId ?? ''}`;
    if (!item?.sourceId || !seen.has(key)) {
      result.push(item);
      if (item?.sourceId) seen.add(key);
    }
  }
  return result;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function removeOutliers(comparables) {
  if ((comparables || []).length < 4) return [...(comparables || [])];
  const prices = comparables.map((item) => Number(item.price)).filter(Number.isFinite);
  const center = median(prices);
  const deviations = prices.map((price) => Math.abs(price - center));
  const mad = median(deviations);
  if (!mad) return [...comparables];
  const limit = 3.5 * 1.4826 * mad;
  return comparables.filter((item) => Math.abs(Number(item.price) - center) <= limit);
}

function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

function roundScore(value) {
  return Math.round(value * 100) / 100;
}

function verificationLevel(item) {
  return String(item?.verification || '').toLowerCase();
}

function soldConfidenceAuthority(item) {
  if (classifyEvidence(item) !== 'sold') return 0;

  const verification = verificationLevel(item);
  if (verification === 'verified_sale') return 1;
  if (verification === 'seller_scoped_sale') return 0.6;
  if (verification === 'unverified_sale_claim') return 0;

  // Preserve legacy deterministic behavior for sold evidence created before
  // verification metadata existed. New provider records should always declare it.
  return 1;
}

function valuationWeight(item) {
  if (classifyEvidence(item) !== 'sold') return 0.5;

  const verification = verificationLevel(item);
  if (verification === 'verified_sale') return 2.5;
  if (verification === 'seller_scoped_sale') return 1.25;
  if (verification === 'unverified_sale_claim') return 0.25;

  return 2;
}

function soldQualityScore(item) {
  if (classifyEvidence(item) !== 'sold') return null;

  const verification = verificationLevel(item);
  let verificationScore = 0;
  if (verification === 'verified_sale') verificationScore = 1;
  else if (verification === 'seller_scoped_sale') verificationScore = 0.6;
  else if (verification === 'unverified_sale_claim') verificationScore = 0;

  const freshnessMultiplier = item?.freshness?.isRecent === false ? 0.5 : 1;
  return verificationScore * freshnessMultiplier;
}

function summarizeEvidence(items) {
  const sold = items.filter((item) => classifyEvidence(item) === 'sold');
  const qualityScores = sold.map(soldQualityScore).filter((score) => score !== null);

  return {
    soldCount: sold.length,
    askingCount: items.length - sold.length,
    verifiedSoldCount: sold.filter((item) => verificationLevel(item) === 'verified_sale').length,
    soldEvidenceQuality: qualityScores.length
      ? roundScore(qualityScores.reduce((sum, score) => sum + score, 0) / qualityScores.length)
      : 0
  };
}

function calculateConfidence(items) {
  if (!items.length) return 0;
  const sampleScore = Math.min(1, items.length / 6);
  const soldScore = items.reduce((sum, item) => sum + soldConfidenceAuthority(item), 0) / items.length;
  const similarityScore = items.reduce((sum, item) => sum + item.similarity, 0) / items.length;
  const prices = items.map((item) => item.price);
  const avg = prices.reduce((sum, price) => sum + price, 0) / prices.length;
  const spread = avg ? (Math.max(...prices) - Math.min(...prices)) / avg : 1;
  const agreementScore = Math.max(0, 1 - Math.min(1, spread));
  return roundScore(sampleScore * 0.25 + soldScore * 0.3 + similarityScore * 0.25 + agreementScore * 0.2);
}

export function estimateValue(comparables) {
  const normalized = dedupeComparables(comparables)
    .map((item) => ({
      ...item,
      price: normalizePrice(item?.price, item?.currency || 'USD'),
      similarity: Math.max(0, Math.min(1, Number(item?.similarity ?? 1)))
    }))
    .filter((item) => item.price !== null && item.similarity >= 0.5);

  if (normalized.length < 2) {
    return {
      status: 'insufficient_evidence',
      estimate: null,
      range: null,
      confidence: 0,
      evidenceCount: normalized.length,
      outlierCount: 0,
      ...summarizeEvidence(normalized)
    };
  }

  const strong = removeOutliers(normalized);
  const outlierCount = normalized.length - strong.length;
  if (strong.length < 2) {
    return {
      status: 'insufficient_evidence',
      estimate: null,
      range: null,
      confidence: 0,
      evidenceCount: strong.length,
      outlierCount,
      ...summarizeEvidence(strong)
    };
  }

  let weightedSum = 0;
  let totalWeight = 0;

  for (const item of strong) {
    const weight = valuationWeight(item) * item.similarity;
    weightedSum += item.price * weight;
    totalWeight += weight;
  }

  const estimate = roundMoney(weightedSum / totalWeight);
  const prices = strong.map((item) => item.price).sort((a, b) => a - b);
  const low = prices[0];
  const high = prices[prices.length - 1];

  return {
    status: 'ok',
    estimate,
    range: { low: roundMoney(low), high: roundMoney(high) },
    confidence: calculateConfidence(strong),
    evidenceCount: strong.length,
    outlierCount,
    ...summarizeEvidence(strong)
  };
}
