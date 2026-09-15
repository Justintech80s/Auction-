import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SCAN_SESSION_STORAGE_KEY,
  createMemoryScanSessionStore,
  createScanSessionStore
} from '../extension/storage/scan-session.js';

function fakeStorage() {
  const values = new Map();
  return {
    async get(key) {
      return { [key]: values.get(key) };
    },
    async set(record) {
      for (const [key, value] of Object.entries(record)) values.set(key, value);
    },
    async remove(key) {
      values.delete(key);
    },
    values
  };
}

test('scan session survives a new store instance so a late side panel can hydrate', async () => {
  const storage = fakeStorage();
  const first = createScanSessionStore(storage);
  await first.set({
    scanId: 'scan-1',
    tabId: 42,
    sourceUrl: 'https://www.amazon.com/example',
    state: 'complete',
    identifiedProduct: { title: 'Garmin Watch', brand: 'Garmin' },
    result: {
      status: 'complete',
      identifiedProduct: { title: 'Garmin Watch' },
      lowestPrice: null,
      priceComparison: [],
      savingsTips: [],
      providerErrors: []
    },
    updatedAt: '2026-09-14T20:00:00.000Z'
  });

  const second = createScanSessionStore(storage);
  const restored = await second.get();

  assert.equal(restored.state, 'complete');
  assert.equal(restored.scanId, 'scan-1');
  assert.equal(restored.result.status, 'complete');
  assert.ok(storage.values.has(SCAN_SESSION_STORAGE_KEY));
});

test('memory session store provides a bounded fallback when chrome.storage.session is absent', async () => {
  const store = createMemoryScanSessionStore();
  await store.set({
    scanId: 'scan-memory',
    tabId: 3,
    sourceUrl: 'https://www.bestbuy.com/example',
    state: 'scanning',
    result: null
  });
  assert.equal((await store.get()).state, 'scanning');
  await store.clear();
  assert.equal(await store.get(), null);
});

test('scan session refuses raw page and credential-shaped fields', async () => {
  const store = createMemoryScanSessionStore();
  await assert.rejects(
    () => store.set({
      scanId: 'scan-secret',
      tabId: 9,
      sourceUrl: 'https://shop.example/item',
      state: 'complete',
      result: {
        status: 'complete',
        rawHtml: '<html>private page</html>',
        cookie: 'session=secret'
      }
    }),
    /forbidden/i
  );
});

test('scan session rejects oversized results', async () => {
  const store = createMemoryScanSessionStore();
  await assert.rejects(
    () => store.set({
      scanId: 'scan-large',
      tabId: 9,
      sourceUrl: 'https://shop.example/item',
      state: 'complete',
      result: { value: 'x'.repeat(70 * 1024) }
    }),
    /storage limit/i
  );
});
