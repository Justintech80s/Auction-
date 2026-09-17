import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { createAuctionServiceWorker } from '../extension/service-worker.js';
import { MESSAGE_TYPES, createExtensionMessage } from '../extension/messaging/messages.js';
import { dellEvidence, dellIdentity } from './helpers/product-search-fixtures.js';
import { workerScanHarness } from './helpers/worker-scan-harness.js';

function scanRequest() {
  return createExtensionMessage(MESSAGE_TYPES.SCAN_ACTIVE_PRODUCT_REQUEST, {
    tabId: 42,
    evidence: dellEvidence({ observedPrice: 39.95, observedCurrency: 'USD' })
  });
}

test('service worker finishes an identified scan with an explicit no-results terminal state', async () => {
  const harness = workerScanHarness();
  const worker = createAuctionServiceWorker({
    runtime: harness.runtime,
    publish: harness.publish,
    identifyProductImpl: async () => ({ status: 'identified', identity: dellIdentity() }),
    searchAcrossStoresImpl: async () => ({ offers: [], providerErrors: [] })
  });

  worker.start();
  const response = await harness.dispatch(scanRequest());

  assert.equal(response.type, MESSAGE_TYPES.CROSS_STORE_SEARCH_RESULT);
  assert.equal(response.payload.status, 'no_exact_match');
  assert.deepEqual(response.payload.offers, []);
  worker.stop();
});

test('shipping sidebar source no longer contains obsolete resale/watchlist application code', () => {
  const source = fs.readFileSync(new URL('../extension/sidepanel/app.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /createWatchlistStore|createCostPresetStore|COST_INPUTS|cost-preset-/);
});

test('shopping sidebar has a terminal no-results message instead of an indefinite waiting state', () => {
  const source = fs.readFileSync(new URL('../extension/sidepanel/shared-session.js', import.meta.url), 'utf8');
  assert.match(source, /No verified cheaper prices found/);
  assert.match(source, /no_results/);
});


test('popup dispatches price comparison without awaiting the provider response', () => {
  const source = fs.readFileSync(new URL('../extension/popup/app.js', import.meta.url), 'utf8');
  assert.match(source, /Promise\.resolve\(runtimeApi\.sendMessage\(request\)\)\.catch/);
  assert.doesNotMatch(source, /await withTimeout\(runtimeApi\.sendMessage\(request\)\)/);
});

test('Chrome startup uses the fixed Auction API instead of legacy local backend configuration', () => {
  const source = fs.readFileSync(new URL('../extension/service-worker.js', import.meta.url), 'utf8');
  assert.match(source, /https:\/\/auction-jays-list\.vercel\.app\/api\/product-scan/);
  assert.doesNotMatch(source, /createSharedBackendConfigStore|createLazySharedBackend/);
});
