import test from 'node:test';
import assert from 'node:assert/strict';

import { createAuctionServiceWorker } from '../extension/service-worker.js';
import {
  MESSAGE_TYPES,
  createExtensionMessage
} from '../extension/messaging/messages.js';
import { dellEvidence, dellIdentity, dellOffer } from './helpers/product-search-fixtures.js';
import { workerScanHarness } from './helpers/worker-scan-harness.js';

function scanRequest() {
  return createExtensionMessage(MESSAGE_TYPES.SCAN_ACTIVE_PRODUCT_REQUEST, {
    tabId: 42,
    evidence: dellEvidence()
  });
}

test('scan request publishes identified state then ranked cross-store results', async () => {
  const harness = workerScanHarness();
  const worker = createAuctionServiceWorker({
    runtime: harness.runtime,
    publish: harness.publish,
    identifyProductImpl: async () => ({ status: 'identified', identity: dellIdentity() }),
    searchAcrossStoresImpl: async () => ({
      offers: [dellOffer()],
      providerErrors: []
    })
  });

  worker.start();
  const response = await harness.dispatch(scanRequest());

  assert.equal(harness.published.length, 2);
  assert.equal(harness.published[0].type, MESSAGE_TYPES.SCAN_ACTIVE_PRODUCT_RESULT);
  assert.equal(harness.published[0].payload.status, 'identified');
  assert.equal(harness.published[1].type, MESSAGE_TYPES.CROSS_STORE_SEARCH_RESULT);
  assert.equal(harness.published[1].payload.status, 'complete');
  assert.equal(harness.published[1].payload.groups.used.cheapestItemId, 'fixture-store:offer-1');
  assert.equal(response.type, MESSAGE_TYPES.CROSS_STORE_SEARCH_RESULT);
  worker.stop();
});

test('one shopping provider failure preserves offers as partial_results', async () => {
  const harness = workerScanHarness();
  const worker = createAuctionServiceWorker({
    runtime: harness.runtime,
    publish: harness.publish,
    identifyProductImpl: async () => ({ status: 'identified', identity: dellIdentity() }),
    searchAcrossStoresImpl: async () => ({
      offers: [dellOffer()],
      providerErrors: [{ source: 'broken-store', code: 'provider_unavailable' }]
    })
  });

  worker.start();
  await harness.dispatch(scanRequest());

  const result = harness.published.at(-1);
  assert.equal(result.payload.status, 'partial_results');
  assert.equal(result.payload.offers.length, 1);
  assert.deepEqual(result.payload.providerErrors, [{ source: 'broken-store', code: 'provider_unavailable' }]);
  worker.stop();
});

test('needs_confirmation publishes scan state and stops before shopping search', async () => {
  const harness = workerScanHarness();
  let searches = 0;
  const worker = createAuctionServiceWorker({
    runtime: harness.runtime,
    publish: harness.publish,
    identifyProductImpl: async () => ({ status: 'needs_confirmation', identity: null }),
    searchAcrossStoresImpl: async () => {
      searches += 1;
      return { offers: [], providerErrors: [] };
    }
  });

  worker.start();
  const response = await harness.dispatch(scanRequest());

  assert.equal(searches, 0);
  assert.equal(harness.published.length, 1);
  assert.equal(harness.published[0].payload.status, 'needs_confirmation');
  assert.equal(response.type, MESSAGE_TYPES.SCAN_ACTIVE_PRODUCT_RESULT);
  worker.stop();
});

test('unavailable shopping providers produce provider_unavailable without throwing', async () => {
  const harness = workerScanHarness();
  const worker = createAuctionServiceWorker({
    runtime: harness.runtime,
    publish: harness.publish,
    identifyProductImpl: async () => ({ status: 'identified', identity: dellIdentity() }),
    searchAcrossStoresImpl: async () => ({
      offers: [],
      providerErrors: [{ source: 'shopping', code: 'provider_unavailable' }]
    })
  });

  worker.start();
  const response = await harness.dispatch(scanRequest());

  assert.equal(response.payload.status, 'provider_unavailable');
  assert.equal(harness.published.at(-1).payload.status, 'provider_unavailable');
  worker.stop();
});

test('confirmed identity can request cross-store search directly', async () => {
  const harness = workerScanHarness();
  let searchedIdentity = null;
  const worker = createAuctionServiceWorker({
    runtime: harness.runtime,
    publish: harness.publish,
    searchAcrossStoresImpl: async (identity) => {
      searchedIdentity = identity;
      return { offers: [dellOffer()], providerErrors: [] };
    }
  });

  worker.start();
  const response = await harness.dispatch(createExtensionMessage(
    MESSAGE_TYPES.CROSS_STORE_SEARCH_REQUEST,
    { identity: dellIdentity() }
  ));

  assert.equal(searchedIdentity.model, 'Latitude 7420');
  assert.equal(response.type, MESSAGE_TYPES.CROSS_STORE_SEARCH_RESULT);
  assert.equal(response.payload.status, 'complete');
  worker.stop();
});
