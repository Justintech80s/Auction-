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

function calculateConfidence(items, soldCount) {
  if (!items.length) return 0;
  const sampleScore = Math.min(1, items.length / 6);
  const soldScore = soldCount / items.length;
  const similarityScore = items.reduce((sum, item) => sum + item.similarity, 0) / items.length;
  const prices = items.map((item) => item.price);
  const avg = prices.reduce((sum, price) => sum + price, 0) / prices.length;
  const spread = avg ? (Math.max(...prices) - Math.min(...prices)) / avg : 1;
  const agreementScore = Math.max(0, 1 - Math.min(1, spread));
  return Math.round((sampleScore * 0.25 + soldScore * 0.3 + similarityScore * 0.25 + agreementScore * 0.2) * 100) / 100;
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
      soldCount: normalized.filter((item) => classifyEvidence(item) === 'sold').length,
      askingCount: normalized.filter((item) => classifyEvidence(item) === 'asking').length
    };
  }

  const strong = removeOutliers(normalized);
  const outlierCount = normalized.length - strong.length;
  if (strong.length < 2) {
    return {
      status: 'insufficient_evidence', estimate: null, range: null, confidence: 0,
      evidenceCount: strong.length, outlierCount,
      soldCount: 0, askingCount: strong.length
    };
  }

  let weightedSum = 0;
  let totalWeight = 0;
  let soldCount = 0;
  let askingCount = 0;

  for (const item of strong) {
    const evidence = classifyEvidence(item);
    const evidenceWeight = evidence === 'sold' ? 2 : 0.5;
    const weight = evidenceWeight * item.similarity;
    weightedSum += item.price * weight;
    totalWeight += weight;
    if (evidence === 'sold') soldCount += 1;
    else askingCount += 1;
  }

  const estimate = roundMoney(weightedSum / totalWeight);
  const prices = strong.map((item) => item.price).sort((a, b) => a - b);
  const low = prices[0];
  const high = prices[prices.length - 1];

  return {
    status: 'ok',
    estimate,
    range: { low: roundMoney(low), high: roundMoney(high) },
    confidence: calculateConfidence(strong, soldCount),
    evidenceCount: strong.length,
    outlierCount,
    soldCount,
    askingCount
  };
}
