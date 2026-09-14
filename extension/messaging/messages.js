import { normalizeDetectedProduct } from '../adapters/contract.js';
import {
  normalizeOffer,
  normalizeProductIdentity,
  normalizeScanEvidence
} from '../../src/product-search/contracts.js';

export const MESSAGE_TYPES = Object.freeze({
  PRODUCT_DETECTED: 'AUCTION_PRODUCT_DETECTED',
  ANALYSIS_REQUEST: 'AUCTION_ANALYSIS_REQUEST',
  ANALYSIS_RESULT: 'AUCTION_ANALYSIS_RESULT',
  ANALYSIS_ERROR: 'AUCTION_ANALYSIS_ERROR',
  SCAN_ACTIVE_PRODUCT_REQUEST: 'AUCTION_SCAN_ACTIVE_PRODUCT_REQUEST',
  SCAN_ACTIVE_PRODUCT_RESULT: 'AUCTION_SCAN_ACTIVE_PRODUCT_RESULT',
  CROSS_STORE_SEARCH_REQUEST: 'AUCTION_CROSS_STORE_SEARCH_REQUEST',
  CROSS_STORE_SEARCH_RESULT: 'AUCTION_CROSS_STORE_SEARCH_RESULT'
});

const SUPPORTED_TYPES = new Set(Object.values(MESSAGE_TYPES));
const MAX_MESSAGE_BYTES = 64 * 1024;
const MAX_OFFERS = 60;
const MAX_PROVIDER_ERRORS = 20;
const CONDITIONS = Object.freeze(['new', 'refurbished', 'used', 'unknown']);
const SCAN_STATUSES = new Set(['identified', 'needs_confirmation', 'unidentified']);
const SEARCH_STATUSES = new Set(['complete', 'partial_results', 'no_exact_match', 'provider_unavailable']);
const COST_FIELDS = Object.freeze([
  'marketplaceFee',
  'shipping',
  'tax',
  'repairs',
  'paymentProcessing',
  'holding'
]);
const utf8Encoder = new TextEncoder();

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function serializedSize(value) {
  try {
    return utf8Encoder.encode(JSON.stringify(value)).byteLength;
  } catch {
    throw new TypeError('message must be JSON serializable');
  }
}

function assertMessageSize(message) {
  if (serializedSize(message) > MAX_MESSAGE_BYTES) {
    throw new RangeError('message exceeds maximum size');
  }
}

function normalizeProduct(product) {
  return normalizeDetectedProduct(product, {
    now: product?.capturedAt
  });
}

function normalizeCosts(costs) {
  if (costs === undefined || costs === null) return undefined;
  if (!isPlainObject(costs)) throw new TypeError('costs must be an object');

  const normalized = {};
  for (const field of COST_FIELDS) {
    if (costs[field] === undefined || costs[field] === null) continue;
    const value = Number(costs[field]);
    if (!Number.isFinite(value) || value < 0) {
      throw new TypeError(`${field} must be a finite non-negative number`);
    }
    normalized[field] = value;
  }
  return Object.freeze(normalized);
}

function normalizeProductPayload(payload, { allowCosts = false } = {}) {
  if (!isPlainObject(payload)) throw new TypeError('message payload must be an object');
  const product = normalizeProduct(payload.product);
  if (!allowCosts) return Object.freeze({ product });

  const costs = normalizeCosts(payload.costs);
  return Object.freeze({
    product,
    ...(costs === undefined ? {} : { costs })
  });
}

function normalizeAnalysisPayload(payload) {
  if (!isPlainObject(payload)) throw new TypeError('message payload must be an object');
  if (!isPlainObject(payload.analysis)) throw new TypeError('analysis result must be an object');
  return Object.freeze({ analysis: payload.analysis });
}

function boundedString(value, name, maxLength) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} is required`);
  const normalized = value.trim();
  if (normalized.length > maxLength) throw new RangeError(`${name} exceeds maximum length`);
  return normalized;
}

function nullableBoundedString(value, name, maxLength) {
  if (value === null || value === undefined || value === '') return null;
  return boundedString(value, name, maxLength);
}

function normalizeErrorPayload(payload) {
  if (!isPlainObject(payload)) throw new TypeError('message payload must be an object');
  return Object.freeze({
    code: boundedString(payload.code, 'error code', 64),
    message: boundedString(payload.message, 'error message', 512)
  });
}

function normalizeScanRequestPayload(payload) {
  if (!isPlainObject(payload)) throw new TypeError('message payload must be an object');
  const tabId = Number(payload.tabId);
  if (!Number.isInteger(tabId) || tabId <= 0) throw new TypeError('tabId must be a positive integer');
  return Object.freeze({
    tabId,
    evidence: normalizeScanEvidence(payload.evidence, { now: payload.evidence?.capturedAt })
  });
}

function normalizeScanResultPayload(payload) {
  if (!isPlainObject(payload)) throw new TypeError('message payload must be an object');
  const status = boundedString(payload.status, 'scan status', 32);
  if (!SCAN_STATUSES.has(status)) throw new TypeError('unsupported scan status');
  if (status === 'identified' && !payload.identity) {
    throw new TypeError('identified scan result requires identity');
  }
  const identity = payload.identity == null
    ? null
    : normalizeProductIdentity(payload.identity, { now: payload.identity?.capturedAt });
  return Object.freeze({ status, identity });
}

function normalizeSearchRequestPayload(payload) {
  if (!isPlainObject(payload)) throw new TypeError('message payload must be an object');
  return Object.freeze({
    identity: normalizeProductIdentity(payload.identity, { now: payload.identity?.capturedAt })
  });
}

function normalizeOfferIds(value, name) {
  if (value == null) return Object.freeze([]);
  if (!Array.isArray(value)) throw new TypeError(`${name} must be an array`);
  if (value.length > MAX_OFFERS) throw new RangeError(`${name} exceeds maximum entries`);
  return Object.freeze(value.map((entry) => boundedString(entry, `${name} entry`, 384)));
}

function normalizeGroup(group, condition) {
  const source = isPlainObject(group) ? group : {};
  return Object.freeze({
    offerIds: normalizeOfferIds(source.offerIds, `${condition} offerIds`),
    cheapestItemId: nullableBoundedString(source.cheapestItemId, `${condition} cheapestItemId`, 384),
    cheapestTotalId: nullableBoundedString(source.cheapestTotalId, `${condition} cheapestTotalId`, 384),
    bestExactId: nullableBoundedString(source.bestExactId, `${condition} bestExactId`, 384)
  });
}

function normalizeGroups(value) {
  const source = isPlainObject(value) ? value : {};
  return Object.freeze(Object.fromEntries(
    CONDITIONS.map((condition) => [condition, normalizeGroup(source[condition], condition)])
  ));
}

function normalizeProviderErrors(value) {
  if (value == null) return Object.freeze([]);
  if (!Array.isArray(value)) throw new TypeError('providerErrors must be an array');
  if (value.length > MAX_PROVIDER_ERRORS) throw new RangeError('providerErrors exceeds maximum entries');
  return Object.freeze(value.map((entry) => {
    if (!isPlainObject(entry)) throw new TypeError('provider error must be an object');
    return Object.freeze({
      source: boundedString(entry.source, 'provider error source', 64),
      code: boundedString(entry.code, 'provider error code', 64)
    });
  }));
}

function normalizeSearchResultPayload(payload) {
  if (!isPlainObject(payload)) throw new TypeError('message payload must be an object');
  const status = boundedString(payload.status, 'search status', 32);
  if (!SEARCH_STATUSES.has(status)) throw new TypeError('unsupported search status');
  if (!Array.isArray(payload.offers)) throw new TypeError('offers must be an array');
  if (payload.offers.length > MAX_OFFERS) throw new RangeError('offers exceeds maximum entries');

  return Object.freeze({
    status,
    identity: normalizeProductIdentity(payload.identity, { now: payload.identity?.capturedAt }),
    offers: Object.freeze(payload.offers.map((offer) => normalizeOffer(offer))),
    groups: normalizeGroups(payload.groups),
    providerErrors: normalizeProviderErrors(payload.providerErrors)
  });
}

function normalizePayload(type, payload) {
  switch (type) {
    case MESSAGE_TYPES.PRODUCT_DETECTED:
      return normalizeProductPayload(payload);
    case MESSAGE_TYPES.ANALYSIS_REQUEST:
      return normalizeProductPayload(payload, { allowCosts: true });
    case MESSAGE_TYPES.ANALYSIS_RESULT:
      return normalizeAnalysisPayload(payload);
    case MESSAGE_TYPES.ANALYSIS_ERROR:
      return normalizeErrorPayload(payload);
    case MESSAGE_TYPES.SCAN_ACTIVE_PRODUCT_REQUEST:
      return normalizeScanRequestPayload(payload);
    case MESSAGE_TYPES.SCAN_ACTIVE_PRODUCT_RESULT:
      return normalizeScanResultPayload(payload);
    case MESSAGE_TYPES.CROSS_STORE_SEARCH_REQUEST:
      return normalizeSearchRequestPayload(payload);
    case MESSAGE_TYPES.CROSS_STORE_SEARCH_RESULT:
      return normalizeSearchResultPayload(payload);
    default:
      throw new TypeError('unsupported message type');
  }
}

export function validateExtensionMessage(message) {
  if (!isPlainObject(message)) throw new TypeError('message must be an object');
  assertMessageSize(message);

  if (typeof message.type !== 'string' || !SUPPORTED_TYPES.has(message.type)) {
    throw new TypeError('unsupported message type');
  }

  const normalized = Object.freeze({
    type: message.type,
    payload: normalizePayload(message.type, message.payload)
  });

  assertMessageSize(normalized);
  return normalized;
}

export function createExtensionMessage(type, payload) {
  return validateExtensionMessage({ type, payload });
}
