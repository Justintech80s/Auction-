function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function peerMedians(entries) {
  const grouped = new Map();
  for (const entry of entries) {
    if (entry?.match?.classification !== 'exact') continue;
    const price = Number(entry?.offer?.itemPrice);
    if (!Number.isFinite(price) || price <= 0) continue;
    const condition = String(entry?.offer?.condition || 'unknown');
    if (!grouped.has(condition)) grouped.set(condition, []);
    grouped.get(condition).push(price);
  }

  return new Map([...grouped.entries()].map(([condition, prices]) => [
    condition,
    prices.length >= 3 ? median(prices) : null
  ]));
}

export function screenMatchedOffers(matchedOffers = []) {
  if (!Array.isArray(matchedOffers)) throw new TypeError('matchedOffers must be an array');
  const medians = peerMedians(matchedOffers);

  return matchedOffers.map((entry) => {
    const offer = entry?.offer || {};
    const match = entry?.match || { classification: 'rejected', score: 0, reasons: [] };
    const reasons = [];
    let guardianDecision = 'allow';

    if (match.classification === 'rejected') {
      guardianDecision = 'reject';
      reasons.push('product_match_rejected');
    } else {
      if (offer.trustTier === 'broad' && Number(offer.sourceConfidence) < 0.75) {
        guardianDecision = 'review';
        reasons.push('weak_source_confidence');
      }

      const peerMedian = medians.get(String(offer.condition || 'unknown'));
      const itemPrice = Number(offer.itemPrice);
      if (
        match.classification === 'exact'
        && Number.isFinite(peerMedian)
        && peerMedian > 0
        && Number.isFinite(itemPrice)
        && itemPrice > 0
        && itemPrice < peerMedian * 0.25
      ) {
        guardianDecision = 'review';
        reasons.push('implausible_low_price');
      }
    }

    return Object.freeze({
      offer,
      match,
      guardianDecision,
      guardianReasons: Object.freeze(reasons)
    });
  });
}
