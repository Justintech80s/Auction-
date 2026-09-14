import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { createPopupApp } from '../extension/popup/app.js';
import { MESSAGE_TYPES } from '../extension/messaging/messages.js';
import { popupHarness } from './helpers/popup-harness.js';

test('manifest adds explicit scan permissions and toolbar popup without all_urls', async () => {
  const raw = await readFile(new URL('../extension/manifest.json', import.meta.url), 'utf8');
  const manifest = JSON.parse(raw);
  assert.deepEqual(manifest.permissions, ['sidePanel', 'storage', 'activeTab', 'scripting']);
  assert.equal(manifest.action.default_popup, 'popup/index.html');
  assert.equal(JSON.stringify(manifest).includes('<all_urls>'), false);
  assert.deepEqual(manifest.host_permissions, [
    'https://www.ebay.com/*',
    'https://www.amazon.com/*',
    'https://www.walmart.com/*',
    'https://www.bestbuy.com/*'
  ]);
});

test('Scan This Product scans only the active tab, opens side panel, and sends bounded evidence', async () => {
  const harness = popupHarness({ tabId: 42 });
  const app = createPopupApp(harness.dependencies);

  await harness.click('scan-product');

  assert.equal(harness.scriptCalls.length, 1);
  assert.deepEqual(harness.scriptCalls[0].target, { tabId: 42 });
  assert.deepEqual(harness.openedPanels, [{ tabId: 42 }]);
  assert.equal(harness.sentMessages.length, 1);
  assert.equal(harness.sentMessages[0].type, MESSAGE_TYPES.SCAN_ACTIVE_PRODUCT_REQUEST);
  assert.equal(harness.sentMessages[0].payload.tabId, 42);
  assert.equal(harness.sentMessages[0].payload.evidence.model, 'Latitude 7420');
  app.destroy();
});

test('Open Auction Sidebar opens the panel without scanning', async () => {
  const harness = popupHarness({ tabId: 8 });
  const app = createPopupApp(harness.dependencies);

  await harness.click('open-sidebar');

  assert.deepEqual(harness.openedPanels, [{ tabId: 8 }]);
  assert.equal(harness.scriptCalls.length, 0);
  assert.equal(harness.sentMessages.length, 0);
  app.destroy();
});

test('restricted browser pages fail safely without scan or message', async () => {
  const harness = popupHarness({ tabId: 7, url: 'chrome://extensions/' });
  const app = createPopupApp(harness.dependencies);

  await harness.click('scan-product');

  assert.equal(harness.scriptCalls.length, 0);
  assert.equal(harness.sentMessages.length, 0);
  assert.equal(harness.status(), 'Auction cannot scan this browser page.');
  app.destroy();
});
