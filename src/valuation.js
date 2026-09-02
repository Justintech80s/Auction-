export function classifyEvidence(listing) {
  return String(listing?.status || '').toLowerCase() === 'sold' ? 'sold' : 'asking';
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

export function estimateValue(comparables) {
  const usable = dedupeComparables(comparables).filter((item) =>
    Number.isFinite(Number(item?.price)) && Number(item.price) > 0
  );

  const strong = usable.filter((item) => Number(item?.similarity ?? 1) >= 0.5);
  if (strong.length < 2) {
    return {
      status: 'insufficient_evidence',
      estimate: null,
      soldCount: strong.filter((item) => classifyEvidence(item) === 'sold').length,
      askingCount: strong.filter((item) => classifyEvidence(item) === 'asking').length,
    };
  }

  let weightedSum = 0;
  let totalWeight = 0;
  let soldCount = 0;
  let askingCount = 0;

  for (const item of strong) {
    const evidence = classifyEvidence(item);
    const similarity = Math.max(0, Math.min(1, Number(item?.similarity ?? 1)));
    const evidenceWeight = evidence === 'sold' ? 2 : 0.5;
    const weight = evidenceWeight * similarity;
    weightedSum += Number(item.price) * weight;
    totalWeight += weight;
    if (evidence === 'sold') soldCount += 1;
    else askingCount += 1;
  }

  return {
    status: 'ok',
    estimate: Math.round((weightedSum / totalWeight) * 100) / 100,
    soldCount,
    askingCount,
  };
}
