const VERIFICATION_LEVELS = new Set([
  'verified_sale',
  'seller_scoped_sale',
  'unverified_sale_claim'
]);

function boundedString(value, maxLength) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function normalizeSoldPrice(value, currency) {
  if (String(currency || '').toUpperCase() !== 'USD') {
    throw new Error('Unsupported sold evidence currency');
  }

  const parsed = typeof value === 'number'
    ? value
    : Number(String(value ?? '').replace(/[$,\s]/g, ''));

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('soldPrice must be a positive number');
  }

  return parsed;
}

function parseSoldAt(value, now) {
  const soldAt = new Date(value);
  if (Number.isNaN(soldAt.getTime())) {
    throw new Error('soldAt must be a valid timestamp');
  }

  if (soldAt.getTime() > now.getTime()) {
    throw new Error('soldAt cannot be in the future');
  }

  return soldAt;
}

function normalizeVerification(value) {
  const verification = boundedString(value, 64);
  if (!VERIFICATION_LEVELS.has(verification)) {
    throw new Error('Invalid sold evidence verification level');
  }
  return verification;
}

function calculateFreshness(soldAt, now) {
  const ageMs = Math.max(0, now.getTime() - soldAt.getTime());
  const ageDays = Math.floor(ageMs / 86_400_000);
  return {
    ageDays,
    isRecent: ageDays <= 90
  };
}

export function normalizeSoldRecord(record = {}, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const source = boundedString(record.source, 128);
  const sourceId = boundedString(record.sourceId, 256);

  if (!source) throw new Error('source is required');
  if (!sourceId) throw new Error('sourceId is required');

  const currency = boundedString(record.currency, 8).toUpperCase();
  const soldPrice = normalizeSoldPrice(record.soldPrice ?? record.price, currency);
  const soldAt = parseSoldAt(record.soldAt, now);
  const verification = normalizeVerification(record.verification);

  return {
    source,
    sourceId,
    title: boundedString(record.title, 512),
    soldPrice,
    price: soldPrice,
    currency,
    soldAt: soldAt.toISOString(),
    verification,
    provenance: record.provenance && typeof record.provenance === 'object'
      ? { ...record.provenance }
      : {},
    freshness: calculateFreshness(soldAt, now),
    url: record.url ? boundedString(record.url, 2048) : null,
    condition: record.condition ? boundedString(record.condition, 128) : null,
    status: 'sold',
    evidenceType: 'sold'
  };
}
