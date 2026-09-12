import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createAuctionAnalysisHandler,
  createAuctionServiceWorker
} from '../extension/service-worker.js';
import {
  MESSAGE_TYPES,
  createExtensionMessage
} from '../extension/messaging/messages.js';

function product(overrides = {}) {
  return {
    source: 'amazon',
    url: 'https://www.amazon.com/dp/B000TEST01',
    title: 'Sony WM-2 Walkman',
    price: 100,
    currency: 'USD',
    condition: 'Used',
    seller: null,
    brand: 'Sony',
    model: 'WM-2',
    category: 'Portable Cassette Players',
    identifiers: { asin: 'B000TEST01' },
    capturedAt: '2026-09-12T20:00:00.000Z',
    ...overrides
  };
}

function askingComparables() {
  return [
    {
      source: 'ebay',
      sourceId: 'ask-1',
      title: 'Sony WM-2 Walkman Portable Cassette Player',
      price: 185,
      currency: 'USD',
      status: 'active',
      url: 'https://www.ebay.com/itm/1'
    },
    {
      source: 'ebay',
      sourceId: 'ask-2',
      title: 'Sony WM-2 Portable Cassette Player Walkman',
      price: 215,
      currency: 'USD',
      status: 'active',
      url: 'https://www.ebay.com/itm/2'
    }
  ];
}

function fakeRuntime() {
  let listener = null;
  return {
    onMessage: {
      addListener(fn) { listener = fn; },
      removeListener(fn) { if (listener === fn) listener = null; }
    },
    async dispatch(message) {
      assert.equal(typeof listener, 'function');
      return new Promise((resolve) => {
        const keepOpen = listener(message, { id: 'auction-extension' }, resolve);
        assert.equal(keepOpen, true);
      });
    },
    hasListener() { return typeof listener === 'function'; }
  };
}

test('analysis handler delegates to the existing Auction pipeline with Guardian enabled', async () => {
  const analyze = createAuctionAnalysisHandler({
    pipelineOptions: {
      search: async () => askingComparables()
    }
  });

  const result = await analyze(product());

  assert.equal(result.status, 'ok');
  assert.equal(result.valuation.status, 'ok');
  assert.equal(result.soldEvidence.status, 'not_configured');
  assert.equal(result.security.decision, 'allow');
  assert.equal(result.opportunity.acquisitionPrice, 100);
  assert.ok(Array.isArray(result.provenance));
});

test('sold provider failures safely preserve asking-evidence valuation', async () => {
  const analyze = createAuctionAnalysisHandler({
    pipelineOptions: {
      search: async () => askingComparables(),
      soldEvidenceProvider: {
        name: 'failing-provider',
        async searchSoldEvidence() {
          throw new Error('secret upstream details');
        }
      }
    }
  });

  const result = await analyze(product());

  assert.equal(result.status, 'ok');
  assert.equal(result.valuation.status, 'ok');
  assert.equal(result.soldEvidence.status, 'unavailable');
  assert.equal(result.soldEvidence.provider, 'failing-provider');
});

test('service worker preserves Guardian/manual-review outcomes returned by Auction', async () => {
  const runtime = fakeRuntime();
  const worker = createAuctionServiceWorker({
    runtime,
    valueItemImpl: async (_item, options) => {
      assert.equal(options.guardian, true);
      return {
        valuation: { status: 'ok', estimate: 200, confidence: 0.8 },
        opportunity: { decision: 'manual_review' },
        soldEvidence: { status: 'ok', verifiedCount: 1, risk: { decision: 'review' } },
        security: { decision: 'review' },
        provenance: [{ evidenceId: 'ebay:sold-1' }]
      };
    }
  });

  worker.start();
  const response = await runtime.dispatch(createExtensionMessage(
    MESSAGE_TYPES.ANALYSIS_REQUEST,
    { product: product() }
  ));

  assert.equal(response.type, MESSAGE_TYPES.ANALYSIS_RESULT);
  assert.equal(response.payload.analysis.security.decision, 'review');
  assert.equal(response.payload.analysis.opportunity.decision, 'manual_review');
  worker.stop();
  assert.equal(runtime.hasListener(), false);
});

test('service worker rejects malformed browser products without calling Auction', async () => {
  const runtime = fakeRuntime();
  let calls = 0;
  const worker = createAuctionServiceWorker({
    runtime,
    valueItemImpl: async () => {
      calls += 1;
      return {};
    }
  });

  worker.start();
  const response = await runtime.dispatch({
    type: MESSAGE_TYPES.ANALYSIS_REQUEST,
    payload: {
      product: {
        source: 'amazon',
        url: 'http://not-secure.example/item',
        title: '',
        price: -10,
        currency: 'USD'
      }
    }
  });

  assert.equal(response.type, MESSAGE_TYPES.ANALYSIS_ERROR);
  assert.equal(response.payload.code, 'INVALID_MESSAGE');
  assert.equal(calls, 0);
});
