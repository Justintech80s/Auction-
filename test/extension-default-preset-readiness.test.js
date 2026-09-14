import test from 'node:test';
import assert from 'node:assert/strict';

import { createSidePanelApp } from '../extension/sidepanel/app.js';
import { MESSAGE_TYPES } from '../extension/messaging/messages.js';

function deferred() {
  let resolve;
  const promise = new Promise(res => { resolve = res; });
  return { promise, resolve };
}

function fakeDocument() {
  const elements = new Map();

  function makeElement(id = '') {
    const listeners = new Map();
    const children = [];
    return {
      id,
      value: '',
      textContent: '',
      hidden: false,
      disabled: false,
      children,
      addEventListener(type, listener) { listeners.set(type, listener); },
      replaceChildren(...next) { children.splice(0, children.length, ...next); },
      appendChild(child) { children.push(child); return child; }
    };
  }

  return {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, makeElement(id));
      return elements.get(id);
    },
    createElement() { return makeElement(); }
  };
}

function product() {
  return {
    source: 'amazon',
    url: 'https://www.amazon.com/dp/B000TEST01',
    title: 'Sony Walkman',
    price: 100,
    currency: 'USD',
    condition: 'Used',
    seller: 'trusted-seller',
    brand: 'Sony',
    model: 'WM-1',
    category: 'Portable Cassette Players',
    identifiers: { asin: 'B000TEST01' },
    capturedAt: '2026-09-13T20:00:00.000Z'
  };
}

test('first detected product waits for default cost preset readiness before analysis', async () => {
  const gate = deferred();
  const documentLike = fakeDocument();
  let onMessage;
  const sent = [];
  const sendCalled = deferred();

  const preset = {
    key: 'daily-resale',
    name: 'Daily resale',
    costs: { marketplaceFee: 11, shipping: 7 }
  };

  const runtime = {
    onMessage: {
      addListener(listener) { onMessage = listener; },
      removeListener() {}
    },
    async sendMessage(message) {
      sent.push(message);
      sendCalled.resolve();
      return {
        type: MESSAGE_TYPES.ANALYSIS_RESULT,
        payload: {
          analysis: {
            status: 'ok',
            valuation: { status: 'ok', estimate: 220, range: { low: 195, high: 245 }, confidence: 0.84 },
            opportunity: { decision: 'buy', reason: 'Auction returned buy.', expectedProfit: 90 },
            soldEvidence: { status: 'ok', verifiedCount: 6 },
            security: { decision: 'allow' }
          }
        }
      };
    }
  };

  const costPresetStore = {
    async save() {},
    async list() { return [preset]; },
    async remove() { return false; },
    async setDefault() { return preset; },
    async getDefault() { return gate.promise; },
    async clearDefault() { return false; }
  };

  createSidePanelApp({ documentLike, runtime, costPresetStore });

  onMessage({ type: MESSAGE_TYPES.PRODUCT_DETECTED, payload: { product: product() } });
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(sent.length, 0, 'analysis must wait until the default preset finishes loading');

  gate.resolve(preset);
  await sendCalled.promise;

  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].payload.costs, { marketplaceFee: 11, shipping: 7 });
});
