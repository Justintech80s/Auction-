import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MESSAGE_TYPES,
  createExtensionMessage,
  validateExtensionMessage
} from '../extension/messaging/messages.js';
import {
  createAuctionClient,
  mapProductToAuctionInput
} from '../extension/messaging/auction-client.js';

const product = Object.freeze({
  source: 'ebay',
  url: 'https://www.ebay.com/itm/1234567890',
  title: 'Sony WM-2 Walkman Portable Cassette Player',
  price: 129.99,
  currency: 'USD',
  condition: 'Used',
  seller: 'retro-audio-shop',
  brand: 'Sony',
  model: 'WM-2',
  category: 'Portable Cassette Players',
  identifiers: Object.freeze({ itemId: '1234567890' }),
  capturedAt: '2026-09-12T22:00:00.000Z'
});

test('exports the four browser-extension message types', () => {
  assert.deepEqual(MESSAGE_TYPES, {
    PRODUCT_DETECTED: 'AUCTION_PRODUCT_DETECTED',
    ANALYSIS_REQUEST: 'AUCTION_ANALYSIS_REQUEST',
    ANALYSIS_RESULT: 'AUCTION_ANALYSIS_RESULT',
    ANALYSIS_ERROR: 'AUCTION_ANALYSIS_ERROR'
  });
});

test('analysis requests preserve only normalized product fields', () => {
  const message = createExtensionMessage(MESSAGE_TYPES.ANALYSIS_REQUEST, {
    product: {
      ...product,
      checkoutToken: 'do-not-cross-boundary',
      paymentCard: '4111111111111111'
    }
  });

  assert.equal(message.type, MESSAGE_TYPES.ANALYSIS_REQUEST);
  assert.deepEqual(message.payload.product, product);
  assert.equal('checkoutToken' in message.payload.product, false);
  assert.equal('paymentCard' in message.payload.product, false);
  assert.equal(Object.isFrozen(message.payload.product), true);
});

test('rejects unrecognized and oversized messages', () => {
  assert.throws(
    () => validateExtensionMessage({ type: 'NOT_A_REAL_MESSAGE', payload: {} }),
    /unsupported message type/i
  );

  assert.throws(
    () => createExtensionMessage(MESSAGE_TYPES.ANALYSIS_ERROR, {
      code: 'TEST',
      message: 'x'.repeat(70_000)
    }),
    /message exceeds maximum size/i
  );
});

test('rejects malformed product payloads at the message boundary', () => {
  assert.throws(
    () => createExtensionMessage(MESSAGE_TYPES.ANALYSIS_REQUEST, {
      product: { ...product, price: -1 }
    }),
    /price must be a positive finite number/i
  );
});

test('maps normalized product data to Auction item and acquisition inputs without recommendation thresholds', () => {
  const mapped = mapProductToAuctionInput(product);

  assert.deepEqual(mapped.item, {
    title: product.title,
    brand: product.brand,
    model: product.model,
    category: product.category,
    condition: product.condition,
    identifiers: product.identifiers
  });
  assert.equal(mapped.acquisitionPrice, 129.99);
  assert.equal(mapped.currency, 'USD');
  assert.equal(mapped.marketplace, 'ebay');
  assert.equal(mapped.url, product.url);
  assert.equal('targetMarginPct' in mapped, false);
  assert.equal('strongBuyThreshold' in mapped, false);
});

test('auction client sends only normalized product data to analyze and returns a result message', async () => {
  let received = null;
  const client = createAuctionClient({
    analyze: async (normalizedProduct) => {
      received = normalizedProduct;
      return {
        valuation: { status: 'ok', estimate: 210, confidence: 0.83 },
        opportunity: { decision: 'buy' }
      };
    }
  });

  const response = await client.handleMessage({
    type: MESSAGE_TYPES.ANALYSIS_REQUEST,
    payload: {
      product: { ...product, secretPageField: 'must be stripped' }
    }
  });

  assert.deepEqual(received, product);
  assert.equal('secretPageField' in received, false);
  assert.equal(response.type, MESSAGE_TYPES.ANALYSIS_RESULT);
  assert.equal(response.payload.analysis.opportunity.decision, 'buy');
});

test('auction client returns safe errors without leaking analyzer exceptions', async () => {
  const client = createAuctionClient({
    analyze: async () => {
      throw new Error('upstream token=super-secret internal failure');
    }
  });

  const response = await client.handleMessage({
    type: MESSAGE_TYPES.ANALYSIS_REQUEST,
    payload: { product }
  });

  assert.equal(response.type, MESSAGE_TYPES.ANALYSIS_ERROR);
  assert.equal(response.payload.code, 'ANALYSIS_FAILED');
  assert.equal(response.payload.message, 'Auction analysis failed safely.');
  assert.equal(JSON.stringify(response).includes('super-secret'), false);
});

test('auction client safely rejects messages other than analysis requests', async () => {
  const client = createAuctionClient({ analyze: async () => ({}) });
  const response = await client.handleMessage({
    type: MESSAGE_TYPES.PRODUCT_DETECTED,
    payload: { product }
  });

  assert.equal(response.type, MESSAGE_TYPES.ANALYSIS_ERROR);
  assert.equal(response.payload.code, 'UNSUPPORTED_REQUEST');
});
