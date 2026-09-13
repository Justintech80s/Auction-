import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  MAX_WATCHLIST_RECORDS,
  WATCHLIST_STORAGE_KEY,
  createWatchlistStore
} from '../extension/storage/watchlist.js';
import { createSidePanelApp } from '../extension/sidepanel/app.js';
import { MESSAGE_TYPES } from '../extension/messaging/messages.js';

function product(index = 1, overrides = {}) {
  return {
    source: 'amazon',
    url: `https://www.amazon.com/dp/B000TEST${String(index).padStart(2, '0')}`,
    title: `Sony Walkman ${index}`,
    price: 100 + index,
    currency: 'USD',
    condition: 'Used',
    seller: 'trusted-seller',
    brand: 'Sony',
    model: `WM-${index}`,
    category: 'Portable Cassette Players',
    identifiers: { asin: `B000TEST${String(index).padStart(2, '0')}` },
    capturedAt: '2026-09-12T20:00:00.000Z',
    ...overrides
  };
}

function analysis(overrides = {}) {
  return {
    status: 'ok',
    valuation: {
      status: 'ok',
      estimate: 220,
      range: { low: 195, high: 245 },
      confidence: 0.84,
      verifiedSoldCount: 6
    },
    opportunity: {
      decision: 'buy',
      reason: 'Auction returned buy.',
      expectedProfit: 90
    },
    soldEvidence: { status: 'ok', verifiedCount: 6 },
    security: { decision: 'allow' },
    provenance: [{ privateUpstreamBlob: 'do-not-store' }],
    token: 'secret-token',
    rawHtml: '<form><input name="card"></form>',
    ...overrides
  };
}

function fakeStorage(seed = {}) {
  let data = structuredClone(seed);
  return {
    async get(key) {
      return { [key]: structuredClone(data[key]) };
    },
    async set(values) {
      data = { ...data, ...structuredClone(values) };
    },
    snapshot() {
      return structuredClone(data);
    }
  };
}

function fakeDocument() {
  const elements = new Map();

  function element(id) {
    const listeners = new Map();
    return {
      id,
      textContent: '',
      hidden: false,
      addEventListener(type, listener) { listeners.set(type, listener); },
      async trigger(type) {
        const listener = listeners.get(type);
        if (listener) return listener();
        return undefined;
      }
    };
  }

  return {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, element(id));
      return elements.get(id);
    }
  };
}

test('watchlist saves only bounded product metadata and selected analysis fields', async () => {
  const storage = fakeStorage();
  const store = createWatchlistStore(storage, {
    now: () => new Date('2026-09-12T21:00:00.000Z')
  });

  await store.save(product(1, {
    url: 'https://www.amazon.com/dp/B000TEST01#reviews',
    rawHtml: '<script>steal()</script>'
  }), analysis());

  const records = await store.list();
  assert.equal(records.length, 1);
  assert.equal(records[0].product.url, 'https://www.amazon.com/dp/B000TEST01');
  assert.equal(records[0].analysis.decision, 'buy');
  assert.equal(records[0].analysis.estimatedValue, 220);
  assert.equal(records[0].analysis.verifiedSoldCount, 6);

  const serialized = JSON.stringify(records);
  assert.ok(!serialized.includes('secret-token'));
  assert.ok(!serialized.includes('rawHtml'));
  assert.ok(!serialized.includes('<script>'));
  assert.ok(!serialized.includes('privateUpstreamBlob'));
  assert.ok(!serialized.includes('provenance'));
});

test('watchlist preserves authoritative net economics without recomputing or storing unknown cost fields', async () => {
  const storage = fakeStorage();
  const store = createWatchlistStore(storage);

  await store.save(product(1), analysis({
    opportunity: {
      decision: 'buy',
      reason: 'Net economics pass.',
      expectedProfit: 119,
      costsApplied: true,
      totalCosts: 29.5,
      netProfit: 89.5,
      netMarginPct: 40.68,
      costBreakdown: {
        marketplaceFee: 12.5,
        shipping: 8,
        tax: 0,
        repairs: 4,
        paymentProcessing: 3,
        holding: 2,
        inventedFee: 999
      }
    }
  }));

  const [record] = await store.list();
  assert.equal(record.analysis.costsApplied, true);
  assert.equal(record.analysis.totalCosts, 29.5);
  assert.equal(record.analysis.netProfit, 89.5);
  assert.equal(record.analysis.netMarginPct, 40.68);
  assert.deepEqual(record.analysis.costBreakdown, {
    marketplaceFee: 12.5,
    shipping: 8,
    tax: 0,
    repairs: 4,
    paymentProcessing: 3,
    holding: 2
  });
  assert.equal('inventedFee' in record.analysis.costBreakdown, false);
});

test('watchlist keeps gross-only saves compatible when no costs were applied', async () => {
  const store = createWatchlistStore(fakeStorage());
  await store.save(product(1), analysis());

  const [record] = await store.list();
  assert.equal(record.analysis.costsApplied, false);
  assert.equal(record.analysis.totalCosts, null);
  assert.equal(record.analysis.netProfit, null);
  assert.equal(record.analysis.netMarginPct, null);
  assert.equal(record.analysis.costBreakdown, null);
});

test('watchlist sanitizes malformed persisted net economics instead of trusting them', async () => {
  const seedStore = createWatchlistStore(fakeStorage(), {
    now: () => new Date('2026-09-12T21:00:00.000Z')
  });
  const valid = await seedStore.save(product(1), analysis());

  valid.analysis.costsApplied = true;
  valid.analysis.totalCosts = 'not-a-number';
  valid.analysis.netProfit = Number.POSITIVE_INFINITY;
  valid.analysis.netMarginPct = 'bad';
  valid.analysis.costBreakdown = {
    shipping: -10,
    tax: 0,
    secretFee: 900
  };

  const storage = fakeStorage({ [WATCHLIST_STORAGE_KEY]: [valid] });
  const store = createWatchlistStore(storage);
  const [record] = await store.list();

  assert.equal(record.analysis.costsApplied, true);
  assert.equal(record.analysis.totalCosts, null);
  assert.equal(record.analysis.netProfit, null);
  assert.equal(record.analysis.netMarginPct, null);
  assert.deepEqual(record.analysis.costBreakdown, { tax: 0 });
  assert.equal(JSON.stringify(record).includes('secretFee'), false);
});

test('watchlist deduplicates updates by canonical product URL', async () => {
  const storage = fakeStorage();
  const store = createWatchlistStore(storage, {
    now: () => new Date('2026-09-12T21:00:00.000Z')
  });

  await store.save(product(1, { url: 'https://www.amazon.com/dp/B000TEST01#details', price: 101 }), analysis());
  await store.save(product(1, { url: 'https://www.amazon.com/dp/B000TEST01', price: 149 }), analysis({
    valuation: { status: 'ok', estimate: 250, range: { low: 220, high: 270 }, confidence: 0.9, verifiedSoldCount: 8 }
  }));

  const records = await store.list();
  assert.equal(records.length, 1);
  assert.equal(records[0].product.price, 149);
  assert.equal(records[0].analysis.estimatedValue, 250);
});

test('watchlist evicts the oldest record after the 200 item limit', async () => {
  assert.equal(MAX_WATCHLIST_RECORDS, 200);
  const storage = fakeStorage();
  let tick = 0;
  const store = createWatchlistStore(storage, {
    now: () => new Date(Date.UTC(2026, 8, 12, 21, 0, tick++))
  });

  for (let index = 1; index <= MAX_WATCHLIST_RECORDS + 1; index += 1) {
    await store.save(product(index), analysis());
  }

  const records = await store.list();
  assert.equal(records.length, MAX_WATCHLIST_RECORDS);
  assert.ok(!records.some(record => record.product.title === 'Sony Walkman 1'));
  assert.ok(records.some(record => record.product.title === `Sony Walkman ${MAX_WATCHLIST_RECORDS + 1}`));
});

test('watchlist removes saved records by key', async () => {
  const storage = fakeStorage();
  const store = createWatchlistStore(storage);
  const saved = await store.save(product(1), analysis());

  await store.remove(saved.key);
  assert.deepEqual(await store.list(), []);
});

test('watchlist drops malformed persisted records and cleans storage', async () => {
  const storage = fakeStorage({
    [WATCHLIST_STORAGE_KEY]: [
      { key: 'malformed', product: { title: '' }, analysis: { decision: 'strong_buy' } }
    ]
  });
  const store = createWatchlistStore(storage);

  assert.deepEqual(await store.list(), []);
  assert.deepEqual(storage.snapshot()[WATCHLIST_STORAGE_KEY], []);
});

test('side panel Save action persists the current product and Auction analysis', async () => {
  const documentLike = fakeDocument();
  const saved = [];
  const currentProduct = product(1);
  const currentAnalysis = analysis();

  const app = createSidePanelApp({
    documentLike,
    runtime: {
      onMessage: { addListener() {}, removeListener() {} },
      async sendMessage() {
        return {
          type: MESSAGE_TYPES.ANALYSIS_RESULT,
          payload: { analysis: currentAnalysis }
        };
      }
    },
    watchlistStore: {
      async save(savedProduct, savedAnalysis) {
        saved.push({ product: savedProduct, analysis: savedAnalysis });
      }
    }
  });

  await app.analyze(currentProduct);
  assert.equal(documentLike.getElementById('save-item').hidden, false);
  await documentLike.getElementById('save-item').trigger('click');

  assert.equal(saved.length, 1);
  assert.equal(saved[0].product.url, currentProduct.url);
  assert.equal(saved[0].analysis.opportunity.decision, 'buy');
  assert.equal(documentLike.getElementById('save-item').textContent, 'Saved');
});

test('manifest grants storage only when the real watchlist is present', async () => {
  const raw = await readFile(new URL('../extension/manifest.json', import.meta.url), 'utf8');
  const manifest = JSON.parse(raw);
  assert.deepEqual(manifest.permissions, ['sidePanel', 'storage']);
});

test('side panel markup includes the real Save control', async () => {
  const html = await readFile(new URL('../extension/sidepanel/index.html', import.meta.url), 'utf8');
  assert.match(html, /id="save-item"/);
  assert.match(html, />Save</);
});
