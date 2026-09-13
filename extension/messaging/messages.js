import { normalizeDetectedProduct } from '../adapters/contract.js';

export const MESSAGE_TYPES = Object.freeze({
  PRODUCT_DETECTED: 'AUCTION_PRODUCT_DETECTED',
  ANALYSIS_REQUEST: 'AUCTION_ANALYSIS_REQUEST',
  ANALYSIS_RESULT: 'AUCTION_ANALYSIS_RESULT',
  ANALYSIS_ERROR: 'AUCTION_ANALYSIS_ERROR'
});

const SUPPORTED_TYPES = new Set(Object.values(MESSAGE_TYPES));
const MAX_MESSAGE_BYTES = 64 * 1024;
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

function normalizeErrorPayload(payload) {
  if (!isPlainObject(payload)) throw new TypeError('message payload must be an object');
  return Object.freeze({
    code: boundedString(payload.code, 'error code', 64),
    message: boundedString(payload.message, 'error message', 512)
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
