import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { createSidePanelApp } from '../extension/sidepanel/app.js';

function fakeDocument(initialValues = {}) {
  const elements = new Map();

  function makeElement(id = '') {
    const listeners = new Map();
    const children = [];
    return {
      id,
      value: String(initialValues[id] ?? ''),
      textContent: '',
      hidden: false,
      disabled: false,
      children,
      addEventListener(type, listener) { listeners.set(type, listener); },
      replaceChildren(...next) { children.splice(0, children.length, ...next); },
      appendChild(child) { children.push(child); return child; },
      async trigger(type) { return listeners.get(type)?.(); }
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

test('side panel exposes an explicit Clear Default control', async () => {
  const html = await readFile(new URL('../extension/sidepanel/index.html', import.meta.url), 'utf8');
  assert.match(html, /id=["']clear-default-cost-preset["']/);
});

test('clearing the default keeps the saved preset and current cost inputs intact', async () => {
  const documentLike = fakeDocument({
    'cost-preset-select': 'daily-resale',
    'cost-marketplace-fee': '12.5',
    'cost-shipping': '8'
  });

  let clearCalls = 0;
  let removeCalls = 0;
  const preset = { key: 'daily-resale', name: 'Daily resale', costs: { marketplaceFee: 10, shipping: 6 } };
  const costPresetStore = {
    async save() { return preset; },
    async list() { return [preset]; },
    async remove() { removeCalls += 1; return true; },
    async setDefault() { return preset; },
    async getDefault() { return null; },
    async clearDefault() { clearCalls += 1; return true; }
  };

  const runtime = {
    onMessage: { addListener() {}, removeListener() {} },
    async sendMessage() { throw new Error('not used'); }
  };

  const app = createSidePanelApp({ documentLike, runtime, costPresetStore });
  await app.clearDefaultCostPreset();

  assert.equal(clearCalls, 1);
  assert.equal(removeCalls, 0, 'clearing the default must not delete the saved preset');
  assert.equal((await costPresetStore.list()).length, 1);
  assert.equal(documentLike.getElementById('cost-marketplace-fee').value, '12.5');
  assert.equal(documentLike.getElementById('cost-shipping').value, '8');
  assert.match(documentLike.getElementById('cost-preset-status').textContent, /default.*cleared/i);
});
