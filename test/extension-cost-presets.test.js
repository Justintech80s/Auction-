import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  COST_PRESET_STORAGE_KEY,
  DEFAULT_COST_PRESET_STORAGE_KEY,
  MAX_COST_PRESETS,
  createCostPresetStore
} from '../extension/storage/cost-presets.js';
import { applyCostPreset } from '../extension/sidepanel/app.js';

function fakeStorage(initial = {}) {
  const state = structuredClone(initial);
  return {
    async get(key) {
      return { [key]: structuredClone(state[key]) };
    },
    async set(values) {
      Object.assign(state, structuredClone(values));
    },
    async remove(key) {
      delete state[key];
    },
    snapshot() {
      return structuredClone(state);
    }
  };
}

function fakeDocument(values = {}) {
  const elements = new Map();
  for (const [id, value] of Object.entries(values)) {
    elements.set(id, { value: String(value) });
  }
  return {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, { value: '' });
      return elements.get(id);
    }
  };
}

test('cost preset store saves only explicit allowlisted non-negative costs', async () => {
  const storage = fakeStorage();
  const store = createCostPresetStore(storage, {
    now: () => new Date('2026-09-13T02:00:00.000Z')
  });

  const saved = await store.save('eBay resale', {
    marketplaceFee: 18.25,
    shipping: 12,
    tax: 0,
    repairs: 5,
    paymentProcessing: 3.5,
    holding: 1,
    secret: 'drop-me'
  });

  assert.deepEqual(saved, {
    key: 'ebay resale',
    name: 'eBay resale',
    updatedAt: '2026-09-13T02:00:00.000Z',
    costs: {
      marketplaceFee: 18.25,
      shipping: 12,
      tax: 0,
      repairs: 5,
      paymentProcessing: 3.5,
      holding: 1
    }
  });
  assert.deepEqual(storage.snapshot()[COST_PRESET_STORAGE_KEY], [saved]);
});

test('cost preset store overwrites the same normalized name and lists newest first', async () => {
  let tick = 0;
  const storage = fakeStorage();
  const store = createCostPresetStore(storage, {
    now: () => new Date(`2026-09-13T02:00:0${tick++}.000Z`)
  });

  await store.save('eBay', { shipping: 10 });
  await store.save('Local pickup', { repairs: 8 });
  await store.save('  EBAY  ', { shipping: 14, marketplaceFee: 20 });

  const presets = await store.list();
  assert.equal(presets.length, 2);
  assert.equal(presets[0].name, 'EBAY');
  assert.deepEqual(presets[0].costs, { marketplaceFee: 20, shipping: 14 });
  assert.equal(presets[1].name, 'Local pickup');
});

test('cost preset store rejects invalid names, empty presets, and negative values', async () => {
  const store = createCostPresetStore(fakeStorage());
  await assert.rejects(() => store.save('', { shipping: 1 }), /name/i);
  await assert.rejects(() => store.save('Empty', {}), /at least one/i);
  await assert.rejects(() => store.save('Bad', { shipping: -1 }), /non-negative/i);
  await assert.rejects(() => store.save('Bad', { tax: Number.POSITIVE_INFINITY }), /finite/i);
});

test('cost preset store removes presets and enforces the 20 preset cap', async () => {
  let tick = 0;
  const storage = fakeStorage();
  const store = createCostPresetStore(storage, {
    now: () => new Date(1_800_000_000_000 + tick++ * 1000)
  });

  for (let index = 0; index < MAX_COST_PRESETS + 2; index += 1) {
    await store.save(`Preset ${index}`, { shipping: index });
  }

  let presets = await store.list();
  assert.equal(presets.length, MAX_COST_PRESETS);
  assert.equal(presets.at(-1).name, 'Preset 2');

  assert.equal(await store.remove('preset 21'), true);
  assert.equal(await store.remove('missing'), false);
  presets = await store.list();
  assert.equal(presets.some(preset => preset.key === 'preset 21'), false);
});

test('malformed persisted cost presets are cleaned instead of trusted', async () => {
  const storage = fakeStorage({
    [COST_PRESET_STORAGE_KEY]: [
      { key: 'good', name: 'Good', updatedAt: '2026-09-13T02:00:00.000Z', costs: { shipping: 9 } },
      { key: 'bad', name: 'Bad', updatedAt: 'not-a-date', costs: { shipping: 9 } },
      { key: 'negative', name: 'Negative', updatedAt: '2026-09-13T02:00:00.000Z', costs: { shipping: -5 } }
    ]
  });
  const store = createCostPresetStore(storage);

  const presets = await store.list();
  assert.deepEqual(presets.map(preset => preset.name), ['Good']);
  assert.equal(storage.snapshot()[COST_PRESET_STORAGE_KEY].length, 1);
});

test('cost preset store sets, changes, and clears a default by existing preset key', async () => {
  const storage = fakeStorage();
  const store = createCostPresetStore(storage);
  const ebay = await store.save('eBay', { shipping: 10 });
  const pickup = await store.save('Local pickup', { repairs: 4 });

  assert.deepEqual(await store.setDefault(ebay.key), ebay);
  assert.equal(storage.snapshot()[DEFAULT_COST_PRESET_STORAGE_KEY], ebay.key);
  assert.deepEqual(await store.getDefault(), ebay);

  assert.deepEqual(await store.setDefault(pickup.key), pickup);
  assert.equal(storage.snapshot()[DEFAULT_COST_PRESET_STORAGE_KEY], pickup.key);
  assert.deepEqual(await store.getDefault(), pickup);

  assert.equal(await store.clearDefault(), true);
  assert.equal(storage.snapshot()[DEFAULT_COST_PRESET_STORAGE_KEY], undefined);
  assert.equal(await store.getDefault(), null);
  assert.equal(await store.clearDefault(), false);
});

test('cost preset store rejects missing default targets and cleans malformed or stale defaults', async () => {
  const storage = fakeStorage({ [DEFAULT_COST_PRESET_STORAGE_KEY]: { bad: true } });
  const store = createCostPresetStore(storage);
  await store.save('Good', { shipping: 5 });

  assert.equal(await store.getDefault(), null);
  assert.equal(storage.snapshot()[DEFAULT_COST_PRESET_STORAGE_KEY], undefined);
  await assert.rejects(() => store.setDefault('missing'), /saved preset/i);

  await storage.set({ [DEFAULT_COST_PRESET_STORAGE_KEY]: 'missing' });
  assert.equal(await store.getDefault(), null);
  assert.equal(storage.snapshot()[DEFAULT_COST_PRESET_STORAGE_KEY], undefined);
});

test('deleting the default preset safely clears the default selection', async () => {
  const storage = fakeStorage();
  const store = createCostPresetStore(storage);
  const preset = await store.save('Default resale', { marketplaceFee: 12 });
  await store.setDefault(preset.key);

  assert.equal(await store.remove(preset.key), true);
  assert.equal(await store.getDefault(), null);
  assert.equal(storage.snapshot()[DEFAULT_COST_PRESET_STORAGE_KEY], undefined);
});

test('applying a cost preset populates only the six existing explicit cost fields', () => {
  const documentLike = fakeDocument({
    'cost-marketplace-fee': '99',
    'cost-shipping': '99',
    'cost-tax': '99',
    'cost-repairs': '99',
    'cost-payment-processing': '99',
    'cost-holding': '99',
    unrelated: 'leave-me'
  });

  applyCostPreset(documentLike, {
    marketplaceFee: 12.5,
    shipping: 8,
    repairs: 0
  });

  assert.equal(documentLike.getElementById('cost-marketplace-fee').value, '12.5');
  assert.equal(documentLike.getElementById('cost-shipping').value, '8');
  assert.equal(documentLike.getElementById('cost-tax').value, '');
  assert.equal(documentLike.getElementById('cost-repairs').value, '0');
  assert.equal(documentLike.getElementById('cost-payment-processing').value, '');
  assert.equal(documentLike.getElementById('cost-holding').value, '');
  assert.equal(documentLike.getElementById('unrelated').value, 'leave-me');
});

test('side panel markup exposes preset name, select, save, apply, delete, and set-default controls', async () => {
  const html = await readFile(new URL('../extension/sidepanel/index.html', import.meta.url), 'utf8');
  for (const id of [
    'cost-preset-name',
    'cost-preset-select',
    'save-cost-preset',
    'apply-cost-preset',
    'delete-cost-preset',
    'set-default-cost-preset'
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(html, /saved locally/i);
  assert.match(html, /default/i);
});
