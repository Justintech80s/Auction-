import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { createAuctionServiceWorker } from '../extension/service-worker.js';
import { MESSAGE_TYPES, createExtensionMessage } from '../extension/messaging/messages.js';
import { dellEvidence } from './helpers/product-search-fixtures.js';
import { workerScanHarness } from './helpers/worker-scan-harness.js';

test('scan id survives popup message validation and shared backend lifecycle', async () => {
  const request = createExtensionMessage(MESSAGE_TYPES.SCAN_ACTIVE_PRODUCT_REQUEST, {
    tabId: 42,
    scanId: 'chrome-real-scan-1',
    evidence: dellEvidence({ observedPrice: 39.95, observedCurrency: 'USD' })
  });
  assert.equal(request.payload.scanId, 'chrome-real-scan-1');

  const harness = workerScanHarness();
  const worker = createAuctionServiceWorker({
    runtime: harness.runtime,
    publish: harness.publish,
    sharedBackend: {
      async scanProduct() {
        return {
          status: 'no_results',
          identifiedProduct: { title: 'Dell Latitude 7420', brand: 'Dell', model: 'Latitude 7420', features: [], imageUrl: null, confidence: 0.95 },
          currentPagePrice: { amount: 39.95, currency: 'USD' },
          lowestPrice: null,
          savings: null,
          priceComparison: [],
          savingsTips: [],
          providerErrors: []
        };
      }
    }
  });
  worker.start();
  const response = await harness.dispatch(request);
  assert.equal(response.scanId, 'chrome-real-scan-1');
  const sessionMessages = harness.published.filter(message => message.type === 'AUCTION_SCAN_SESSION_STATE');
  assert.ok(sessionMessages.length >= 2);
  assert.ok(sessionMessages.every(message => message.payload.scanId === 'chrome-real-scan-1'));
  assert.equal(sessionMessages.at(-1).payload.state, 'no_results');
  assert.equal(sessionMessages.at(-1).payload.result.currentPagePrice.amount, 39.95);
  worker.stop();
});

test('side panel renders in-progress session states instead of staying idle', () => {
  const source = fs.readFileSync(new URL('../extension/sidepanel/shared-session.js', import.meta.url), 'utf8');
  assert.match(source, /function renderSession/);
  assert.match(source, /showState\(session\.state\)/);
  assert.doesNotMatch(source, /SCAN_SESSION_STATE&&m\.payload\?\.result/);
});

test('popup attaches a scan id and exposes terminal success or failure copy', () => {
  const source = fs.readFileSync(new URL('../extension/popup/app.js', import.meta.url), 'utf8');
  assert.match(source, /createScanId/);
  assert.match(source, /scanId,evidence/);
  assert.match(source, /Price comparison complete/);
  assert.match(source, /could not reach the scan service/);
});
