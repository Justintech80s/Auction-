export const PRODUCT_CONDITIONS = Object.freeze(['new', 'refurbished', 'used', 'unknown']);

const MAX_IDENTIFIERS = 20;
const MAX_SPECS = 24;

function bounded(value, max, required = false) {
  const text = value == null ? '' : String(value).trim().replace(/\s+/g, ' ');
  if (required && !text) throw new TypeError('required string is missing');
  if (!text) return null;
  if (text.length > max) throw new RangeError('string exceeds maximum length');
  return text;
}

function httpsUrl(value, required = false) {
  if (value == null || value === '') {
    if (required) throw new TypeError('https URL is required');
    return null;
  }

  let url;
  try {
    url = new URL(String(value));
  } catch {
    throw new TypeError('URL must be valid');
  }

  if (url.protocol !== 'https:') throw new TypeError('URL must use https');
  url.hash = '';
  return url.toString();
}

function record(value, maxEntries) {
  if (value == null) return Object.freeze({});
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('record must be an object');
  }

  const entries = Object.entries(value);
  if (entries.length > maxEntries) throw new RangeError('record has too many entries');

  return Object.freeze(Object.fromEntries(entries.map(([key, entry]) => [
    bounded(key, 64, true),
    bounded(entry, 256, true)
  ])));
}

function capturedAt(value) {
  const date = value instanceof Date ? value : new Date(value ?? Date.now());
  if (!Number.isFinite(date.getTime())) throw new TypeError('capturedAt must be a valid date');
  return date.toISOString();
}

export function normalizeCondition(value) {
  const text = String(value ?? '').trim().toLowerCase();
  if (!text) return 'unknown';
  if (/refurb|renewed|remanufactured/.test(text)) return 'refurbished';
  if (/\bused\b|pre[- ]?owned|second[- ]?hand/.test(text)) return 'used';
  if (/\bnew\b/.test(text) && !/open[- ]?box/.test(text)) return 'new';
  return 'unknown';
}

function normalizeConfidence(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1) {
    throw new TypeError('confidence must be between 0 and 1');
  }
  return number;
}

export function normalizeProductIdentity(input = {}, context = {}) {
  return Object.freeze({
    title: bounded(input.title, 512, true),
    brand: bounded(input.brand, 128),
    model: bounded(input.model, 128),
    category: bounded(input.category, 256),
    condition: normalizeCondition(input.condition),
    identifiers: record(input.identifiers, MAX_IDENTIFIERS),
    specs: record(input.specs, MAX_SPECS),
    sourceUrl: httpsUrl(input.sourceUrl, true),
    imageUrl: httpsUrl(input.imageUrl),
    confidence: normalizeConfidence(input.confidence),
    capturedAt: capturedAt(context.now ?? input.capturedAt)
  });
}

export function normalizeScanEvidence(input = {}, context = {}) {
  const evidenceKinds = Array.isArray(input.evidenceKinds)
    ? input.evidenceKinds.slice(0, 8).map(value => bounded(value, 64, true))
    : [];

  return Object.freeze({
    sourceUrl: httpsUrl(input.sourceUrl, true),
    pageTitle: bounded(input.pageTitle, 512),
    title: bounded(input.title, 512),
    brand: bounded(input.brand, 128),
    model: bounded(input.model, 128),
    category: bounded(input.category, 256),
    condition: input.condition == null ? null : normalizeCondition(input.condition),
    identifiers: record(input.identifiers, MAX_IDENTIFIERS),
    specs: record(input.specs, MAX_SPECS),
    imageUrl: httpsUrl(input.imageUrl),
    evidenceKinds: Object.freeze(evidenceKinds),
    confidence: normalizeConfidence(input.confidence ?? 0),
    capturedAt: capturedAt(context.now ?? input.capturedAt)
  });
}

export function normalizeOffer(input = {}) {
  const itemPrice = Number(input.itemPrice);
  if (!Number.isFinite(itemPrice) || itemPrice <= 0) {
    throw new TypeError('itemPrice must be positive');
  }

  const shipping = input.shipping == null ? null : Number(input.shipping);
  if (shipping !== null && (!Number.isFinite(shipping) || shipping < 0)) {
    throw new TypeError('shipping must be non-negative');
  }

  const currency = bounded(input.currency, 3, true).toUpperCase();
  if (currency !== 'USD') throw new TypeError('only USD is supported');

  const source = bounded(input.source, 64, true);
  const sourceId = bounded(input.sourceId, 256, true);

  return Object.freeze({
    offerId: `${source}:${sourceId}`,
    source,
    sourceId,
    store: bounded(input.store, 128, true),
    title: bounded(input.title, 512, true),
    url: httpsUrl(input.url, true),
    imageUrl: httpsUrl(input.imageUrl),
    brand: bounded(input.brand, 128),
    model: bounded(input.model, 128),
    category: bounded(input.category, 256),
    identifiers: record(input.identifiers, MAX_IDENTIFIERS),
    specs: record(input.specs, MAX_SPECS),
    condition: normalizeCondition(input.condition),
    itemPrice,
    shipping,
    estimatedTotal: shipping === null
      ? null
      : Math.round((itemPrice + shipping) * 100) / 100,
    currency,
    availability: bounded(input.availability, 64),
    trustTier: input.trustTier === 'trusted' ? 'trusted' : 'broad',
    sourceConfidence: normalizeConfidence(input.sourceConfidence ?? 0)
  });
}
