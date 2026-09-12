import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  createAuctionAnalysisHandler,
  createAuctionServiceWorker
} from '../extension/service-worker.js';
import {
  MESSAGE_TYPES,
  createExtensionMessage
} from '../extension/messaging/messages.js';
import { createContentBootstrap } from '../extension/content/index.js';

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

test('manifest v3 exposes only the supported shopping domains and side panel', async () => {
  const raw = await readFile(new URL('../extension/manifest.json', import.meta.url), 'utf8');
  const manifest = JSON.parse(raw);

  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ['sidePanel']);
  assert.equal(manifest.side_panel.default_path, 'sidepanel/index.html');
  assert.equal(manifest.background.service_worker, 'service-worker.js');
  assert.equal(manifest.background.type, 'module');
  assert.deepEqual(manifest.host_permissions, [
    'https://www.ebay.com/*',
    'https://www.amazon.com/*',
    'https://www.walmart.com/*',
    'https://www.bestbuy.com/*'
  ]);
  assert.deepEqual(manifest.content_scripts[0].matches, manifest.host_permissions);
  assert.deepEqual(manifest.content_scripts[0].js, ['content/entry.js']);
  assert.equal(manifest.content_scripts[0].world, 'ISOLATED');
  assert.equal(manifest.content_scripts[0].type, undefined);
  assert.deepEqual(manifest.web_accessible_resources, [{
    resources: [
      'content/index.js',
      'content/scanner.js',
      'content/page-observer.js',
      'adapters/*.js',
      'messaging/messages.js'
    ],
    matches: manifest.host_permissions
  }]);
  assert.ok(!JSON.stringify(manifest).includes('<all_urls>'));
  assert.ok(!manifest.permissions.includes('storage'));
});

test('content bootstrap scans immediately and emits a normalized detected product', async () => {
  const detected = product();
  const sent = [];
  let observerCallback = null;
  let started = 0;
  let stopped = 0;

  const bootstrap = createContentBootstrap({
    locationLike: { href: detected.url },
    documentLike: {},
    runtime: {
      async sendMessage(message) {
        sent.push(message);
        return undefined;
      }
    },
    scan: () => ({ status: 'detected', product: detected, adapter: 'amazon' }),
    createObserver: ({ onChange }) => {
      observerCallback = onChange;
      return {
        start() { started += 1; },
        stop() { stopped += 1; }
      };
    },
    now: () => new Date('2026-09-12T20:00:00.000Z')
  });

  await bootstrap.start();

  assert.equal(started, 1);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].type, MESSAGE_TYPES.PRODUCT_DETECTED);
  assert.equal(sent[0].payload.product.url, detected.url);

  observerCallback({ reason: 'url', url: detected.url });
  await bootstrap.flush();
  assert.equal(sent.length, 2);

  bootstrap.stop();
  assert.equal(stopped, 1);
});

test('content bootstrap does not emit unsupported or invalid pages', async () => {
  const sent = [];
  const bootstrap = createContentBootstrap({
    locationLike: { href: 'https://www.amazon.com/s?k=walkman' },
    documentLike: {},
    runtime: { async sendMessage(message) { sent.push(message); } },
    scan: () => ({ status: 'unsupported', product: null, adapter: 'amazon' }),
    createObserver: () => ({ start() {}, stop() {} })
  });

  await bootstrap.start();
  assert.deepEqual(sent, []);
  bootstrap.stop();
});
