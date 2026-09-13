import { normalizeDetectedProduct } from '../adapters/contract.js';
import {
  MESSAGE_TYPES,
  createExtensionMessage,
  validateExtensionMessage
} from './messages.js';

function normalizeProduct(product) {
  return normalizeDetectedProduct(product, {
    now: product?.capturedAt
  });
}

function safeError(code, message) {
  return createExtensionMessage(MESSAGE_TYPES.ANALYSIS_ERROR, { code, message });
}

export function mapProductToAuctionInput(product) {
  const normalized = normalizeProduct(product);

  return Object.freeze({
    item: Object.freeze({
      title: normalized.title,
      brand: normalized.brand,
      model: normalized.model,
      category: normalized.category,
      condition: normalized.condition,
      identifiers: normalized.identifiers
    }),
    acquisitionPrice: normalized.price,
    currency: normalized.currency,
    marketplace: normalized.source,
    url: normalized.url
  });
}

export function createAuctionClient({ analyze } = {}) {
  if (typeof analyze !== 'function') throw new TypeError('analyze function is required');

  async function handleMessage(message) {
    let validated;
    try {
      validated = validateExtensionMessage(message);
    } catch {
      return safeError('INVALID_MESSAGE', 'Invalid Auction extension message.');
    }

    if (validated.type !== MESSAGE_TYPES.ANALYSIS_REQUEST) {
      return safeError('UNSUPPORTED_REQUEST', 'Unsupported Auction extension request.');
    }

    try {
      const analysis = await analyze(validated.payload.product, validated.payload.costs);
      if (!analysis || typeof analysis !== 'object' || Array.isArray(analysis)) {
        throw new TypeError('analysis must be an object');
      }

      return createExtensionMessage(MESSAGE_TYPES.ANALYSIS_RESULT, { analysis });
    } catch {
      return safeError('ANALYSIS_FAILED', 'Auction analysis failed safely.');
    }
  }

  return Object.freeze({
    handleMessage,
    analyzeProduct(product, costs) {
      return handleMessage(createExtensionMessage(MESSAGE_TYPES.ANALYSIS_REQUEST, {
        product,
        ...(costs === undefined ? {} : { costs })
      }));
    }
  });
}
