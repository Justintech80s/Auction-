const DAY_MS = 86_400_000;

function clampScore(value) {
  return Math.max(0, Math.min(1, value));
}

function toDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function evidenceKey(record = {}) {
  return `${String(record.source || '')}:${String(record.sourceId || '')}`;
}

function hasValidProvenance(record = {}) {
  return Boolean(
    record.provenance
    && typeof record.provenance === 'object'
    && !Array.isArray(record.provenance)
    && Object.keys(record.provenance).length
  );
}

function calculateAgeDays(soldAt, now) {
  return Math.floor(Math.max(0, now.getTime() - soldAt.getTime()) / DAY_MS);
}

function riskBand(score) {
  if (score >= 0.8) return 'critical';
  if (score >= 0.6) return 'high';
  if (score >= 0.3) return 'medium';
  return 'low';
}

function addSignal(signals, code, weight, reason, severity = 'review') {
  signals.push({ code, weight, reason, severity });
}

function inspectRecord(record, context) {
  const { now, requireFresh, maxAgeDays, seen, signals } = context;
  const reasons = [];
  let rejectRecord = false;
  let critical = false;

  const key = evidenceKey(record);
  if (!record?.source || !record?.sourceId) {
    addSignal(signals, 'missing_sold_identity', 0.45, 'Sold evidence is missing source identity.');
    reasons.push('missing_sold_identity');
    rejectRecord = true;
  } else if (seen.has(key)) {
    addSignal(signals, 'duplicate_sold_id', 0.35, 'Duplicate sold evidence identifier detected.');
    reasons.push('duplicate_sold_id');
    rejectRecord = true;
  } else {
    seen.add(key);
  }

  const price = Number(record?.soldPrice ?? record?.price);
  if (!Number.isFinite(price) || price <= 0) {
    addSignal(signals, 'invalid_sold_price', 0.5, 'Sold evidence price is malformed or non-positive.');
    reasons.push('invalid_sold_price');
    rejectRecord = true;
  }

  const soldAt = toDate(record?.soldAt);
  if (!soldAt) {
    addSignal(signals, 'invalid_sold_timestamp', 0.5, 'Sold evidence timestamp is malformed.');
    reasons.push('invalid_sold_timestamp');
    rejectRecord = true;
  } else if (soldAt.getTime() > now.getTime()) {
    addSignal(signals, 'future_sold_timestamp', 1, 'Sold evidence timestamp is in the future.', 'reject');
    reasons.push('future_sold_timestamp');
    rejectRecord = true;
    critical = true;
  } else if (requireFresh && calculateAgeDays(soldAt, now) > maxAgeDays) {
    addSignal(signals, 'stale_sold_evidence', 0.3, 'Sold evidence is older than the permitted freshness window.');
    reasons.push('stale_sold_evidence');
  }

  if (!hasValidProvenance(record)) {
    addSignal(signals, 'malformed_provenance', 0.35, 'Sold evidence provenance is missing or malformed.');
    reasons.push('malformed_provenance');
    rejectRecord = true;
  }

  const verification = String(record?.verification || '');
  const provenanceClaimsVerified = record?.provenance?.verified === true;
  if (verification === 'unverified_sale_claim' && provenanceClaimsVerified) {
    addSignal(signals, 'verification_mismatch', 0.35, 'Unverified sold evidence conflicts with provenance verification claims.');
    reasons.push('verification_mismatch');
  }

  if (verification === 'verified_sale' && !hasValidProvenance(record)) {
    addSignal(signals, 'verified_without_provenance', 0.35, 'Verified sale evidence lacks usable provenance.');
    reasons.push('verified_without_provenance');
  }

  return { rejectRecord, critical, reasons };
}

export function assessSoldEvidenceRisk(records = [], options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const requireFresh = options.requireFresh === true;
  const requestedMaxAge = Number(options.maxAgeDays ?? 180);
  const maxAgeDays = Number.isFinite(requestedMaxAge) && requestedMaxAge >= 0 ? requestedMaxAge : 180;
  const signals = [];
  const accepted = [];
  const rejected = [];
  const seen = new Set();
  let critical = false;

  for (const record of Array.isArray(records) ? records : []) {
    const inspection = inspectRecord(record, {
      now,
      requireFresh,
      maxAgeDays,
      seen,
      signals
    });

    if (inspection.critical) critical = true;
    if (inspection.rejectRecord) {
      rejected.push({ record, reasons: inspection.reasons });
    } else {
      accepted.push(record);
    }
  }

  const score = clampScore(signals.reduce((sum, signal) => sum + signal.weight, 0));
  const band = riskBand(score);
  const decision = critical || signals.some((signal) => signal.severity === 'reject')
    ? 'reject'
    : score >= 0.3
      ? 'review'
      : 'allow';

  return {
    decision,
    riskScore: Math.round(score * 100) / 100,
    riskBand: band,
    signals: signals.map(({ code, weight, reason }) => ({ code, weight, reason })),
    accepted,
    rejected
  };
}
