import { normalizeDetectedProduct } from '../adapters/contract.js';

export const WATCHLIST_STORAGE_KEY = 'auctionWatchlistV1';
export const MAX_WATCHLIST_RECORDS = 200;

const DECISIONS = new Set([
  'strong_buy',
  'buy',
  'fair',
  'overpriced',
  'avoid',
  'manual_review'
]);

const COST_FIELDS = Object.freeze([
  'marketplaceFee',
  'shipping',
  'tax',
  'repairs',
  'paymentProcessing',
  'holding'
]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nonNegativeInteger(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : fallback;
}

function boundedOptionalString(value, maxLength = 512) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
}

function normalizeRange(range) {
  if (!range || typeof range !== 'object' || Array.isArray(range)) return null;
  const low = finiteNumber(range.low);
  const high = finiteNumber(range.high);
  if (low === null || high === null) return null;
  return Object.freeze({ low, high });
}

function normalizeCostBreakdown(costBreakdown) {
  if (!costBreakdown || typeof costBreakdown !== 'object' || Array.isArray(costBreakdown)) return null;
  const normalized = {};
  for (const field of COST_FIELDS) {
    if (!(field in costBreakdown)) continue;
    const value = finiteNumber(costBreakdown[field]);
    if (value === null || value < 0) continue;
    normalized[field] = value;
  }
  return Object.keys(normalized).length ? Object.freeze(normalized) : null;
}

function normalizeSavedAt(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new TypeError('savedAt must be a valid date');
  return date.toISOString();
}

function summarizeAnalysis(analysis = {}) {
  const valuation = analysis?.valuation || {};
  const opportunity = analysis?.opportunity || {};
  const soldEvidence = analysis?.soldEvidence || {};
  const security = analysis?.security || {};
  const decision = boundedOptionalString(opportunity.decision, 64);
  const confidence = finiteNumber(valuation.confidence);
  const costsApplied = opportunity.costsApplied === true;

  return Object.freeze({
    status: boundedOptionalString(analysis?.status ?? valuation?.status, 64),
    estimatedValue: finiteNumber(valuation.estimate),
    valueRange: normalizeRange(valuation.range),
    confidence: confidence === null ? null : Math.max(0, Math.min(1, confidence)),
    verifiedSoldCount: nonNegativeInteger(
      soldEvidence.verifiedCount,
      nonNegativeInteger(valuation.verifiedSoldCount, 0)
    ),
    potentialProfit: finiteNumber(opportunity.expectedProfit),
    costsApplied,
    totalCosts: costsApplied ? finiteNumber(opportunity.totalCosts) : null,
    netProfit: costsApplied ? finiteNumber(opportunity.netProfit) : null,
    netMarginPct: costsApplied ? finiteNumber(opportunity.netMarginPct) : null,
    costBreakdown: costsApplied ? normalizeCostBreakdown(opportunity.costBreakdown) : null,
    decision: decision && DECISIONS.has(decision) ? decision : null,
    decisionReason: boundedOptionalString(opportunity.reason, 512),
    riskState: boundedOptionalString(security.decision, 64) || 'unknown',
    soldEvidenceState: boundedOptionalString(soldEvidence.status, 64) || 'not_configured'
  });
}

function sanitizeStoredAnalysis(summary = {}) {
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) {
    throw new TypeError('stored analysis must be an object');
  }

  const decision = boundedOptionalString(summary.decision, 64);
  const confidence = finiteNumber(summary.confidence);
  const costsApplied = summary.costsApplied === true;

  return Object.freeze({
    status: boundedOptionalString(summary.status, 64),
    estimatedValue: finiteNumber(summary.estimatedValue),
    valueRange: normalizeRange(summary.valueRange),
    confidence: confidence === null ? null : Math.max(0, Math.min(1, confidence)),
    verifiedSoldCount: nonNegativeInteger(summary.verifiedSoldCount, 0),
    potentialProfit: finiteNumber(summary.potentialProfit),
    costsApplied,
    totalCosts: costsApplied ? finiteNumber(summary.totalCosts) : null,
    netProfit: costsApplied ? finiteNumber(summary.netProfit) : null,
    netMarginPct: costsApplied ? finiteNumber(summary.netMarginPct) : null,
    costBreakdown: costsApplied ? normalizeCostBreakdown(summary.costBreakdown) : null,
    decision: decision && DECISIONS.has(decision) ? decision : null,
    decisionReason: boundedOptionalString(summary.decisionReason, 512),
    riskState: boundedOptionalString(summary.riskState, 64) || 'unknown',
    soldEvidenceState: boundedOptionalString(summary.soldEvidenceState, 64) || 'not_configured'
  });
}

function normalizeProduct(product) {
  return normalizeDetectedProduct(product, {
    now: product?.capturedAt
  });
}

function sanitizeStoredRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new TypeError('stored watchlist record must be an object');
  }

  const product = normalizeProduct(record.product);
  const key = product.url;
  if (record.key !== key) throw new TypeError('stored watchlist key does not match product URL');

  return Object.freeze({
    key,
    savedAt: normalizeSavedAt(record.savedAt),
    product,
    analysis: sanitizeStoredAnalysis(record.analysis)
  });
}

function assertStorageArea(storageArea) {
  if (!storageArea || typeof storageArea.get !== 'function' || typeof storageArea.set !== 'function') {
    throw new TypeError('storageArea must provide get and set');
  }
  return storageArea;
}

export function createWatchlistStore(storageArea, {
  now = () => new Date()
} = {}) {
  const storage = assertStorageArea(storageArea);
  if (typeof now !== 'function') throw new TypeError('now must be a function');

  async function readRecords() {
    const stored = await storage.get(WATCHLIST_STORAGE_KEY);
    const raw = stored?.[WATCHLIST_STORAGE_KEY];
    if (raw === undefined) return [];

    if (!Array.isArray(raw)) {
      await storage.set({ [WATCHLIST_STORAGE_KEY]: [] });
      return [];
    }

    const cleaned = [];
    const byKey = new Map();
    let dirty = false;

    for (const candidate of raw) {
      try {
        const record = sanitizeStoredRecord(candidate);
        if (byKey.has(record.key)) {
          const existingIndex = byKey.get(record.key);
          cleaned.splice(existingIndex, 1);
          for (const [key, index] of byKey) {
            if (index > existingIndex) byKey.set(key, index - 1);
          }
          dirty = true;
        }
        byKey.set(record.key, cleaned.length);
        cleaned.push(record);
      } catch {
        dirty = true;
      }
    }

    if (cleaned.length > MAX_WATCHLIST_RECORDS) {
      cleaned.splice(0, cleaned.length - MAX_WATCHLIST_RECORDS);
      dirty = true;
    }

    if (dirty) {
      await storage.set({ [WATCHLIST_STORAGE_KEY]: clone(cleaned) });
    }

    return cleaned;
  }

  return Object.freeze({
    async save(product, analysis) {
      const normalizedProduct = normalizeProduct(product);
      const record = Object.freeze({
        key: normalizedProduct.url,
        savedAt: normalizeSavedAt(now()),
        product: normalizedProduct,
        analysis: summarizeAnalysis(analysis)
      });

      const records = await readRecords();
      const next = records.filter(existing => existing.key !== record.key);
      next.push(record);

      if (next.length > MAX_WATCHLIST_RECORDS) {
        next.splice(0, next.length - MAX_WATCHLIST_RECORDS);
      }

      await storage.set({ [WATCHLIST_STORAGE_KEY]: clone(next) });
      return clone(record);
    },

    async remove(key) {
      const normalizedKey = String(key ?? '').trim();
      if (!normalizedKey) return false;
      const records = await readRecords();
      const next = records.filter(record => record.key !== normalizedKey);
      if (next.length === records.length) return false;
      await storage.set({ [WATCHLIST_STORAGE_KEY]: clone(next) });
      return true;
    },

    async list() {
      const records = await readRecords();
      return clone([...records].reverse());
    }
  });
}
