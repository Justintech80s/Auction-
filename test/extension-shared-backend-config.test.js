import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SHARED_BACKEND_ENDPOINT,
  SHARED_BACKEND_STORAGE_KEY,
  createSharedBackendConfigStore
} from '../extension/storage/shared-backend-config.js';

function storageArea(initial = {}) {
  const data = { ...initial };
  return {
    async get(key) {
      return { [key]: data[key] };
    },
    async set(values) {
      Object.assign(data, values);
    },
    async remove(key) {
      delete data[key];
    }
  };
}

test('shared backend config defaults to the production Auction API', async () => {
  const store = createSharedBackendConfigStore(storageArea());

  assert.equal(
    await store.get(),
    'https://auction-jays-list.vercel.app/api/product-scan'
  );
  assert.equal(
    DEFAULT_SHARED_BACKEND_ENDPOINT,
    'https://auction-jays-list.vercel.app/api/product-scan'
  );
});

test('shared backend config stores only an https endpoint', async () => {
  const area = storageArea();
  const store = createSharedBackendConfigStore(area);

  await store.set('https://auction.example/api/product-scan');
  assert.equal(await store.get(), 'https://auction.example/api/product-scan');
});

test('shared backend config rejects http and credential-bearing URLs', async () => {
  const store = createSharedBackendConfigStore(storageArea());

  await assert.rejects(() => store.set('http://auction.example/api/product-scan'), /https/i);
  await assert.rejects(() => store.set('https://user:pass@auction.example/api/product-scan'), /credentials/i);
});

test('shared backend config clears invalid persisted values and falls back to production', async () => {
  const area = storageArea({ [SHARED_BACKEND_STORAGE_KEY]: 'javascript:alert(1)' });
  const store = createSharedBackendConfigStore(area);

  assert.equal(await store.get(), DEFAULT_SHARED_BACKEND_ENDPOINT);
  assert.equal((await area.get(SHARED_BACKEND_STORAGE_KEY))[SHARED_BACKEND_STORAGE_KEY], undefined);
});
