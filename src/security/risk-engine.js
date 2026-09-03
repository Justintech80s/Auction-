function clamp(value) {
  return Math.max(0, Math.min(1, value));
}

function riskBand(score) {
  if (score >= 0.8) return 'critical';
  if (score >= 0.6) return 'high';
  if (score >= 0.3) return 'medium';
  return 'low';
}

function evidenceKey(item = {}) {
  return `${item.source || ''}:${item.sourceId || ''}`;
}

export function assessRisk({ item = {}, comparables = [], valuation = {} } = {}) {
  const signals = [];
  const add = (code, weight, reason, critical = false) => signals.push({ code, weight, reason, critical });

  const seen = new Set();
  for (const comparable of comparables) {
    const key = evidenceKey(comparable);
    if (!comparable?.source || !comparable?.sourceId) add('weak_provenance', 0.35, 'Comparable evidence is missing source provenance.');
    if (key !== ':' && seen.has(key)) add('duplicate_evidence', 0.35, 'Duplicate comparable identifiers were detected.');
    if (key !== ':') seen.add(key);

    const status = String(comparable?.status || '').toLowerCase();
    const evidenceType = String(comparable?.evidenceType || '').toLowerCase();
    if (status === 'sold' && evidenceType && evidenceType !== 'sold') {
      add('sold_status_mismatch', 0.9, 'Sold status conflicts with the declared evidence type.', true);
    }

    const price = Number(comparable?.price);
    if (!Number.isFinite(price) || price <= 0) add('invalid_price', 0.5, 'Comparable price is malformed or non-positive.');

    if (valuation?.estimate && Number.isFinite(price)) {
      const ratio = price / valuation.estimate;
      if (ratio > 8 || ratio < 0.125) add('implausible_price', 0.45, 'Comparable price is implausible relative to the valuation center.');
    }
  }

  if (valuation?.status === 'ok' && Number(valuation?.confidence) < 0.35) {
    add('weak_valuation_confidence', 0.3, 'Valuation confidence is weak.');
  }

  if (comparables.length >= 3) {
    const counts = new Map();
    for (const comparable of comparables) {
      const source = String(comparable?.source || 'unknown');
      counts.set(source, (counts.get(source) || 0) + 1);
    }
    const concentration = Math.max(...counts.values()) / comparables.length;
    if (concentration >= 0.9) add('source_concentration', 0.2, 'Comparable evidence is heavily concentrated in one source.');
  }

  if (valuation?.soldCount > 0 && valuation?.askingCount > 0) {
    const sold = comparables.filter((entry) => String(entry?.status).toLowerCase() === 'sold').map((entry) => Number(entry.price)).filter(Number.isFinite);
    const asking = comparables.filter((entry) => String(entry?.status).toLowerCase() !== 'sold').map((entry) => Number(entry.price)).filter(Number.isFinite);
    if (sold.length && asking.length) {
      const soldAvg = sold.reduce((a, b) => a + b, 0) / sold.length;
      const askingAvg = asking.reduce((a, b) => a + b, 0) / asking.length;
      if (soldAvg > 0 && Math.abs(askingAvg - soldAvg) / soldAvg > 1.5) {
        add('sold_asking_disagreement', 0.35, 'Sold and asking evidence disagree substantially.');
      }
    }
  }

  const critical = signals.some((signal) => signal.critical);
  const score = clamp(signals.reduce((sum, signal) => sum + signal.weight, 0));
  const band = riskBand(score);
  const decision = critical || band === 'critical' ? 'reject' : score >= 0.3 ? 'review' : 'allow';

  return {
    riskScore: Math.round(score * 100) / 100,
    riskBand: band,
    decision,
    signals: signals.map(({ code, weight, reason }) => ({ code, weight, reason })),
    reasons: signals.map((signal) => signal.reason)
  };
}
