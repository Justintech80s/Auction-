import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SCAN_SESSION_REQUEST,
  SCAN_SESSION_STATE,
  SHARED_SCAN_RESULT,
  createAuctionServiceWorker
} from '../extension/service-worker.js';
import { MESSAGE_TYPES, createExtensionMessage } from '../extension/messaging/messages.js';
import { createMemoryScanSessionStore } from '../extension/storage/scan-session.js';
import { dellEvidence } from './helpers/product-search-fixtures.js';
import { workerScanHarness } from './helpers/worker-scan-harness.js';

function scanRequest() {
  return createExtensionMessage(MESSAGE_TYPES.SCAN_ACTIVE_PRODUCT_REQUEST, {
    tabId: 42,
    evidence: dellEvidence()
  });
}

function sharedResult() {
  return Object.freeze({
    status: 'complete',
    identifiedProduct: {
      title: 'Dell Latitude 7420',
      brand: 'Dell',
      model: 'Latitude 7420',
      features: ['16GB RAM', '512GB SSD'],
      imageUrl: 'https://images.example/dell.jpg',
      confidence: 0.97
    },
    lowestPrice: {
      amount: 399.99,
      currency: 'USD',
      store: 'Fixture Store',
      url: 'https://store.example/dell',
      shipping: 12,
      estimatedTotal: 411.99,
      condition: 'used'
    },
    priceComparison: [{
      store: 'Fixture Store',
      title: 'Dell Latitude 7420 16GB 512GB',
      price: 399.99,
      currency: 'USD',
      shipping: 12,
      estimatedTotal: 411.99,
      condition: 'used',
      description: 'Exact model match',
      url: 'https://store.example/dell',
      imageUrl: null,
      matchConfidence: 0.99,
      guardianDecision: 'allow'
    }],
    savingsTips: ['Compare delivered totals before buying.'],
    providerErrors: []
  });
}

test('shared backend receives captured evidence and returns website-style results', async () => {
  const harness = workerScanHarness();
  const store = createMemoryScanSessionStore();
  let receivedEvidence = null;
  const worker = createAuctionServiceWorker({
    runtime: harness.runtime,
    publish: harness.publish,
    scanSessionStore: store,
    sharedBackend: {
      async scanProduct(evidence) {
        receivedEvidence = evidence;
        return sharedResult();
      }
    }
  });

  worker.start();
  const response = await harness.dispatch(scanRequest());

  assert.equal(receivedEvidence.model, 'Latitude 7420');
  assert.equal(response.type, SHARED_SCAN_RESULT);
  assert.equal(response.payload.status, 'complete');
  assert.equal(response.payload.lowestPrice.amount, 399.99);

  const sharedMessages = harness.published.filter(message => message.type === SHARED_SCAN_RESULT);
  assert.equal(sharedMessages.length, 1);
  worker.stop();
});

test('late side panel can retrieve the completed shared scan from persisted session state', async () => {
  const harness = workerScanHarness();
  const store = createMemoryScanSessionStore();
  const worker = createAuctionServiceWorker({
    runtime: harness.runtime,
    publish: harness.publish,
    scanSessionStore: store,
    sharedBackend: { async scanProduct() { return sharedResult(); } }
  });

  worker.start();
  await harness.dispatch(scanRequest());
  harness.published.length = 0;

  const hydrated = await harness.dispatch({ type: SCAN_SESSION_REQUEST });
  assert.equal(hydrated.type, SCAN_SESSION_STATE);
  assert.equal(hydrated.payload.state, 'complete');
  assert.equal(hydrated.payload.result.status, 'complete');
  assert.equal(hydrated.payload.result.identifiedProduct.model, 'Latitude 7420');
  assert.equal(hydrated.payload.result.priceComparison.length, 1);
  worker.stop();
});
