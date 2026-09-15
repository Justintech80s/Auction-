import { scanProductPage } from './scanner.js';
import { createProductPageObserver } from './page-observer.js';
import { MESSAGE_TYPES, createExtensionMessage } from '../messaging/messages.js';
import { createProductSearchBackend } from '../../src/connectors/product-search-backend.js';
import { createSharedBackendConfigStore } from '../storage/shared-backend-config.js';

const SHARED_SCAN_RESULT = 'AUCTION_SHARED_SCAN_RESULT';
const PRICE_HISTORY_RESULT = 'AUCTION_PRICE_HISTORY_RESULT';

function assertRuntime(runtime) {
  if (!runtime || typeof runtime.sendMessage !== 'function') throw new TypeError('runtime.sendMessage is required');
  return runtime;
}

function evidenceFromProduct(product) {
  return {
    sourceUrl: product.url,
    pageTitle: product.title,
    title: product.title,
    brand: product.brand,
    model: product.model,
    category: product.category,
    condition: product.condition,
    identifiers: product.identifiers ?? {},
    specs: {},
    imageUrl: null,
    evidenceKinds: ['marketplace_adapter', 'automatic_price_observation'],
    observedPrice: product.price,
    observedCurrency: product.currency,
    confidence: Object.keys(product.identifiers ?? {}).length ? 0.9 : (product.model ? 0.8 : 0.65),
    capturedAt: product.capturedAt
  };
}

async function automaticShoppingLookup(product, runtime, storageArea, fetchImpl = globalThis.fetch) {
  if (!product?.price || !product?.currency || !storageArea || typeof fetchImpl !== 'function') return;
  const evidence = evidenceFromProduct(product);
  try {
    const config = createSharedBackendConfigStore(storageArea);
    const endpoint = await config.get();
    const backend = createProductSearchBackend({ endpoint, fetchImpl, timeoutMs: 7000 });

    const observationUrl = new URL(endpoint);
    observationUrl.pathname = observationUrl.pathname.replace(/\/product-scan\/?$/, '/product-observation');
    const [sharedResult, observationResponse] = await Promise.all([
      backend.scanProduct(evidence).catch(() => null),
      fetchImpl(observationUrl.toString(), {
        method: 'POST',
        redirect: 'error',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'observe_price', source: 'browser_extension', evidence })
      }).then(response => response.ok ? response.json() : null).catch(() => null)
    ]);

    if (sharedResult) {
      try { await runtime.sendMessage({ type: SHARED_SCAN_RESULT, payload: sharedResult }); } catch {}
    }
    if (observationResponse?.status === 'recorded') {
      try { await runtime.sendMessage({ type: PRICE_HISTORY_RESULT, payload: observationResponse.history }); } catch {}
    }
  } catch {
    // Automatic tracking is best-effort and must never interfere with the retailer page.
  }
}

export function createContentBootstrap({
  locationLike = globalThis.location,
  documentLike = globalThis.document,
  runtime = globalThis.chrome?.runtime,
  storageArea = globalThis.chrome?.storage?.local,
  scan = scanProductPage,
  createObserver = createProductPageObserver,
  now = () => new Date(),
  fetchImpl = globalThis.fetch
} = {}) {
  if (!locationLike || typeof locationLike.href !== 'string') throw new TypeError('locationLike.href is required');
  if (!documentLike) throw new TypeError('documentLike is required');
  const messageRuntime = assertRuntime(runtime);
  if (typeof scan !== 'function') throw new TypeError('scan is required');
  if (typeof createObserver !== 'function') throw new TypeError('createObserver is required');
  if (typeof now !== 'function') throw new TypeError('now is required');

  let started = false;
  let observer = null;
  let pending = Promise.resolve();
  let lastAutomaticKey = null;

  async function scanAndEmit() {
    const result = scan({ url: locationLike.href, documentLike, now: now() });
    if (result?.status !== 'detected' || !result.product) return result;

    const message = createExtensionMessage(MESSAGE_TYPES.PRODUCT_DETECTED, { product: result.product });
    try { await messageRuntime.sendMessage(message); } catch {}

    const automaticKey = [result.product.url, result.product.price, result.product.currency, result.product.title].join('|');
    if (automaticKey !== lastAutomaticKey) {
      lastAutomaticKey = automaticKey;
      void automaticShoppingLookup(result.product, messageRuntime, storageArea, fetchImpl);
    }
    return result;
  }

  function queueScan() {
    pending = pending.then(() => scanAndEmit(), () => scanAndEmit());
    return pending;
  }

  return Object.freeze({
    async start() {
      if (started) return pending;
      started = true;
      observer = createObserver({ locationLike, onChange: () => { if (started) void queueScan(); } });
      if (!observer || typeof observer.start !== 'function' || typeof observer.stop !== 'function') {
        started = false; observer = null; throw new TypeError('observer must provide start and stop');
      }
      observer.start();
      return queueScan();
    },
    stop() { if (!started) return; started = false; observer?.stop(); observer = null; },
    flush() { return pending; }
  });
}

if (typeof document !== 'undefined' && globalThis.location && globalThis.chrome?.runtime?.sendMessage) {
  const bootstrap = createContentBootstrap();
  void bootstrap.start();
}
