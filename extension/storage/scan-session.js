export const SCAN_SESSION_STORAGE_KEY = 'auctionScanSessionV1';

const STATES = new Set([
  'ready',
  'scanning',
  'identifying',
  'needs_confirmation',
  'searching_stores',
  'complete',
  'partial_results',
  'no_results',
  'provider_unavailable',
  'error'
]);
const FORBIDDEN_KEYS = /^(?:raw_?html|html|cookie|cookies|authorization|password|credential|credentials|checkout|payment|card|token)$/i;

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function cleanString(value, max = 512) {
  if (value == null || value === '') return null;
  const text = String(value).trim().replace(/\s+/g, ' ');
  return text ? text.slice(0, max) : null;
}

function assertNoForbiddenFields(value, depth = 0) {
  if (value == null || typeof value !== 'object') return;
  if (depth > 8) throw new TypeError('scan session nesting exceeds limit');
  if (Array.isArray(value)) {
    for (const item of value) assertNoForbiddenFields(item, depth + 1);
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.test(key)) throw new TypeError('forbidden scan session field');
    assertNoForbiddenFields(entry, depth + 1);
  }
}

function cleanSession(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('scan session must be an object');
  assertNoForbiddenFields(input);
  const state = String(input.state || '').trim();
  if (!STATES.has(state)) throw new TypeError('unsupported scan session state');

  const tabId = input.tabId == null ? null : Number(input.tabId);
  if (tabId !== null && (!Number.isInteger(tabId) || tabId <= 0)) throw new TypeError('tabId must be a positive integer');

  const sourceUrl = cleanString(input.sourceUrl, 2048);
  if (sourceUrl) {
    const parsed = new URL(sourceUrl);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new TypeError('sourceUrl must use safe https');
  }

  const updated = new Date(input.updatedAt ?? Date.now());
  if (!Number.isFinite(updated.getTime())) throw new TypeError('updatedAt must be valid');

  const result = input.result == null ? null : clone(input.result);
  const identifiedProduct = input.identifiedProduct == null ? null : clone(input.identifiedProduct);
  const serialized = JSON.stringify({ result, identifiedProduct });
  if (serialized.length > 64 * 1024) throw new RangeError('scan result exceeds storage limit');

  return Object.freeze({
    scanId: cleanString(input.scanId, 96),
    tabId,
    sourceUrl,
    state,
    identifiedProduct,
    result,
    errorCode: cleanString(input.errorCode, 64),
    updatedAt: updated.toISOString()
  });
}

function assertStorage(storageArea) {
  if (!storageArea || typeof storageArea.get !== 'function' || typeof storageArea.set !== 'function' || typeof storageArea.remove !== 'function') {
    throw new TypeError('storageArea must provide get, set, and remove');
  }
  return storageArea;
}

export function createScanSessionStore(storageArea) {
  const storage = assertStorage(storageArea);
  let memory = null;

  return Object.freeze({
    async get() {
      try {
        const stored = await storage.get(SCAN_SESSION_STORAGE_KEY);
        const value = stored?.[SCAN_SESSION_STORAGE_KEY];
        if (!value) return memory;
        memory = cleanSession(value);
        return memory;
      } catch {
        return memory;
      }
    },
    async set(session) {
      const safe = cleanSession(session);
      memory = safe;
      try {
        await storage.set({ [SCAN_SESSION_STORAGE_KEY]: clone(safe) });
      } catch {
        // In-memory fallback remains available for this service-worker lifetime.
      }
      return safe;
    },
    async clear() {
      memory = null;
      try {
        await storage.remove(SCAN_SESSION_STORAGE_KEY);
      } catch {
        // Best-effort storage cleanup.
      }
    }
  });
}

export function createMemoryScanSessionStore() {
  let value = null;
  return Object.freeze({
    async get() { return value; },
    async set(session) { value = cleanSession(session); return value; },
    async clear() { value = null; }
  });
}
