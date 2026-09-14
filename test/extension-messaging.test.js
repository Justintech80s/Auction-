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
import {
  dellEvidence,
  dellIdentity,
  dellOffer
} from './helpers/product-search-fixtures.js';

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

test('exports browser-extension analysis plus scan and search message types', () => {
  assert.deepEqual(MESSAGE_TYPES, {
    PRODUCT_DETECTED: 'AUCTION_PRODUCT_DETECTED',
    ANALYSIS_REQUEST: 'AUCTION_ANALYSIS_REQUEST',
    ANALYSIS_RESULT: 'AUCTION_ANALYSIS_RESULT',
    ANALYSIS_ERROR: 'AUCTION_ANALYSIS_ERROR',
    SCAN_ACTIVE_PRODUCT_REQUEST: 'AUCTION_SCAN_ACTIVE_PRODUCT_REQUEST',
    SCAN_ACTIVE_PRODUCT_RESULT: 'AUCTION_SCAN_ACTIVE_PRODUCT_RESULT',
    CROSS_STORE_SEARCH_REQUEST: 'AUCTION_CROSS_STORE_SEARCH_REQUEST',
    CROSS_STORE_SEARCH_RESULT: 'AUCTION_CROSS_STORE_SEARCH_RESULT'
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

test('analysis requests preserve only allowlisted non-negative explicit costs', () => {
  const message = createExtensionMessage(MESSAGE_TYPES.ANALYSIS_REQUEST, {
    product,
    costs: {
      marketplaceFee: 12.5,
      shipping: 8,
      tax: 3.25,
      repairs: 0,
      paymentProcessing: 2.1,
      holding: 1,
      secretFeeGuess: 999
    }
  });

  assert.deepEqual(message.payload.costs, {
    marketplaceFee: 12.5,
    shipping: 8,
    tax: 3.25,
    repairs: 0,
    paymentProcessing: 2.1,
    holding: 1
  });
  assert.equal('secretFeeGuess' in message.payload.costs, false);
  assert.equal(Object.isFrozen(message.payload.costs), true);
});

test('analysis requests reject negative or non-finite costs', () => {
  assert.throws(() => createExtensionMessage(MESSAGE_TYPES.ANALYSIS_REQUEST, {
    product,
    costs: { shipping: -1 }
  }), /shipping/i);

  assert.throws(() => createExtensionMessage(MESSAGE_TYPES.ANALYSIS_REQUEST, {
    product,
    costs: { tax: Number.POSITIVE_INFINITY }
  }), /tax/i);
});

test('scan request keeps positive tab id and strips arbitrary evidence fields', () => {
  const message = createExtensionMessage(MESSAGE_TYPES.SCAN_ACTIVE_PRODUCT_REQUEST, {
    tabId: 42,
    evidence: {
      ...dellEvidence(),
      rawHtml: '<form>secret</form>',
      cookie: 'session=secret'
    }
  });

  assert.equal(message.payload.tabId, 42);
  assert.equal(message.payload.evidence.model, 'Latitude 7420');
  assert.equal('rawHtml' in message.payload.evidence, false);
  assert.equal('cookie' in message.payload.evidence, false);
});

test('scan request rejects invalid tab ids', () => {
  assert.throws(() => createExtensionMessage(MESSAGE_TYPES.SCAN_ACTIVE_PRODUCT_REQUEST, {
    tabId: 0,
    evidence: dellEvidence()
  }), /tabId/i);
});

test('scan result allows only defined statuses and normalized identities', () => {
  const message = createExtensionMessage(MESSAGE_TYPES.SCAN_ACTIVE_PRODUCT_RESULT, {
    status: 'identified',
    identity: { ...dellIdentity(), secret: 'remove-me' }
  });
  assert.equal(message.payload.status, 'identified');
  assert.equal(message.payload.identity.model, 'Latitude 7420');
  assert.equal('secret' in message.payload.identity, false);

  assert.throws(() => createExtensionMessage(MESSAGE_TYPES.SCAN_ACTIVE_PRODUCT_RESULT, {
    status: 'probably_found',
    identity: dellIdentity()
  }), /status/i);
});

test('cross-store request keeps only normalized identity fields', () => {
  const message = createExtensionMessage(MESSAGE_TYPES.CROSS_STORE_SEARCH_REQUEST, {
    identity: { ...dellIdentity(), rawHtml: '<html>secret</html>' }
  });
  assert.equal(message.payload.identity.model, 'Latitude 7420');
  assert.equal('rawHtml' in message.payload.identity, false);
});

test('cross-store result normalizes offers, groups, and provider errors', () => {
  const offer = dellOffer();
  const message = createExtensionMessage(MESSAGE_TYPES.CROSS_STORE_SEARCH_RESULT, {
    status: 'partial_results',
    identity: dellIdentity(),
    offers: [{ ...offer, secretToken: 'remove-me' }],
    groups: {
      new: { offerIds: [], cheapestItemId: null, cheapestTotalId: null, bestExactId: null },
      refurbished: { offerIds: [], cheapestItemId: null, cheapestTotalId: null, bestExactId: null },
      used: { offerIds: ['fixture-store:offer-1'], cheapestItemId: 'fixture-store:offer-1', cheapestTotalId: 'fixture-store:offer-1', bestExactId: 'fixture-store:offer-1' },
      unknown: { offerIds: [], cheapestItemId: null, cheapestTotalId: null, bestExactId: null }
    },
    providerErrors: [{ source: 'broken', code: 'provider_unavailable', detail: 'token=secret' }]
  });

  assert.equal(message.payload.offers.length, 1);
  assert.equal('secretToken' in message.payload.offers[0], false);
  assert.deepEqual(message.payload.providerErrors, [{ source: 'broken', code: 'provider_unavailable' }]);
  assert.equal(message.payload.groups.used.cheapestTotalId, 'fixture-store:offer-1');
});

test('cross-store result caps offer arrays at 60 and validates search status', () => {
  const offers = Array.from({ length: 61 }, (_, index) => dellOffer({
    sourceId: String(index),
    url: `https://shop.example/products/${index}`
  }));
  assert.throws(() => createExtensionMessage(MESSAGE_TYPES.CROSS_STORE_SEARCH_RESULT, {
    status: 'complete',
    identity: dellIdentity(),
    offers,
    groups: {},
    providerErrors: []
  }), /offers/i);

  assert.throws(() => createExtensionMessage(MESSAGE_TYPES.CROSS_STORE_SEARCH_RESULT, {
    status: 'finished-ish',
    identity: dellIdentity(),
    offers: [],
    groups: {},
    providerErrors: []
  }), /status/i);
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

test('auction client sends normalized product and explicit costs to analyze', async () => {
  let receivedProduct = null;
  let receivedCosts = null;
  const client = createAuctionClient({
    analyze: async (normalizedProduct, costs) => {
      receivedProduct = normalizedProduct;
      receivedCosts = costs;
      return {
        valuation: { status: 'ok', estimate: 210, confidence: 0.83 },
        opportunity: { decision: 'buy' }
      };
    }
  });

  const response = await client.handleMessage({
    type: MESSAGE_TYPES.ANALYSIS_REQUEST,
    payload: {
      product: { ...product, secretPageField: 'must be stripped' },
      costs: { shipping: 9.5, repairs: 12 }
    }
  });

  assert.deepEqual(receivedProduct, product);
  assert.equal('secretPageField' in receivedProduct, false);
  assert.deepEqual(receivedCosts, { shipping: 9.5, repairs: 12 });
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
