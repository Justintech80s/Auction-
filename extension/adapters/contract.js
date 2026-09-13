const SUPPORTED_CURRENCIES = new Set(['USD']);

const FIELD_LIMITS = Object.freeze({
  source: 64,
  title: 512,
  condition: 128,
  seller: 256,
  brand: 128,
  model: 128,
  category: 256,
  identifierKey: 64,
  identifierValue: 256
});

function normalizeBoundedString(value, field, { required = false, max = FIELD_LIMITS[field] ?? 256 } = {}) {
  if (value == null) {
    if (required) throw new TypeError(`${field} is required`);
    return null;
  }

  if (typeof value !== 'string') throw new TypeError(`${field} must be a string`);
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (required && !normalized) throw new TypeError(`${field} is required`);
  if (!normalized) return null;
  if (normalized.length > max) throw new RangeError(`${field} exceeds maximum length`);
  return normalized;
}

function normalizeHttpsUrl(value) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError('url is required');

  let parsed;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new TypeError('url must be a valid URL');
  }

  if (parsed.protocol !== 'https:') throw new TypeError('url must use https');
  parsed.hash = '';
  return parsed.toString();
}

function normalizePrice(price, currency) {
  if (price == null) {
    if (currency != null && String(currency).trim()) {
      throw new TypeError('currency requires a price');
    }
    return { price: null, currency: null };
  }

  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
    throw new TypeError('price must be a positive finite number');
  }

  const normalizedCurrency = normalizeBoundedString(currency, 'currency', { required: true, max: 3 })?.toUpperCase();
  if (!SUPPORTED_CURRENCIES.has(normalizedCurrency)) {
    throw new TypeError(`unsupported currency: ${normalizedCurrency}`);
  }

  return { price, currency: normalizedCurrency };
}

function normalizeIdentifiers(value) {
  if (value == null) return Object.freeze({});
  if (typeof value !== 'object' || Array.isArray(value)) throw new TypeError('identifiers must be an object');

  const entries = Object.entries(value);
  if (entries.length > 20) throw new RangeError('identifiers exceeds maximum entries');

  const normalized = {};
  for (const [key, rawValue] of entries) {
    const normalizedKey = normalizeBoundedString(key, 'identifierKey', { required: true });
    const normalizedValue = normalizeBoundedString(String(rawValue), 'identifierValue', { required: true });
    normalized[normalizedKey] = normalizedValue;
  }
  return Object.freeze(normalized);
}

function normalizeCapturedAt(now) {
  const date = now instanceof Date ? now : new Date(now ?? Date.now());
  if (!Number.isFinite(date.getTime())) throw new TypeError('capturedAt must be a valid date');
  return date.toISOString();
}

export function normalizeDetectedProduct(input, context = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('detected product must be an object');
  }

  const source = normalizeBoundedString(input.source, 'source', { required: true });
  const title = normalizeBoundedString(input.title, 'title', { required: true });
  const url = normalizeHttpsUrl(input.url);
  const pricing = normalizePrice(input.price, input.currency);

  return Object.freeze({
    source,
    url,
    title,
    price: pricing.price,
    currency: pricing.currency,
    condition: normalizeBoundedString(input.condition, 'condition'),
    seller: normalizeBoundedString(input.seller, 'seller'),
    brand: normalizeBoundedString(input.brand, 'brand'),
    model: normalizeBoundedString(input.model, 'model'),
    category: normalizeBoundedString(input.category, 'category'),
    identifiers: normalizeIdentifiers(input.identifiers),
    capturedAt: normalizeCapturedAt(context.now)
  });
}

export function assertMarketplaceAdapter(adapter) {
  if (!adapter || typeof adapter !== 'object') throw new TypeError('marketplace adapter must be an object');
  if (typeof adapter.name !== 'string' || !adapter.name.trim()) throw new TypeError('marketplace adapter name is required');
  if (typeof adapter.matches !== 'function' || typeof adapter.extract !== 'function') {
    throw new TypeError('marketplace adapter must implement matches and extract');
  }
  return adapter;
}
