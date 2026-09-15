export const SHARED_BACKEND_STORAGE_KEY = 'auctionSharedBackendEndpoint';

function normalizeEndpoint(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;

  let url;
  try {
    url = new URL(text);
  } catch {
    throw new TypeError('shared backend endpoint must be a valid https URL');
  }

  if (url.protocol !== 'https:') {
    throw new TypeError('shared backend endpoint must use https');
  }
  if (url.username || url.password) {
    throw new TypeError('shared backend endpoint must not contain credentials');
  }

  url.hash = '';
  return url.toString();
}

export function createSharedBackendConfigStore(storageArea) {
  if (!storageArea || typeof storageArea.get !== 'function' || typeof storageArea.set !== 'function' || typeof storageArea.remove !== 'function') {
    throw new TypeError('storageArea must provide get, set, and remove');
  }

  return Object.freeze({
    async get() {
      const stored = await storageArea.get(SHARED_BACKEND_STORAGE_KEY);
      const raw = stored?.[SHARED_BACKEND_STORAGE_KEY];
      if (!raw) return null;
      try {
        return normalizeEndpoint(raw);
      } catch {
        await storageArea.remove(SHARED_BACKEND_STORAGE_KEY);
        return null;
      }
    },
    async set(value) {
      const endpoint = normalizeEndpoint(value);
      if (!endpoint) {
        await storageArea.remove(SHARED_BACKEND_STORAGE_KEY);
        return null;
      }
      await storageArea.set({ [SHARED_BACKEND_STORAGE_KEY]: endpoint });
      return endpoint;
    },
    async clear() {
      await storageArea.remove(SHARED_BACKEND_STORAGE_KEY);
    }
  });
}
