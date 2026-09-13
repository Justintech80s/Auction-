import { scanProductPage } from './scanner.js';
import { createProductPageObserver } from './page-observer.js';
import { MESSAGE_TYPES, createExtensionMessage } from '../messaging/messages.js';

function assertRuntime(runtime) {
  if (!runtime || typeof runtime.sendMessage !== 'function') {
    throw new TypeError('runtime.sendMessage is required');
  }
  return runtime;
}

export function createContentBootstrap({
  locationLike = globalThis.location,
  documentLike = globalThis.document,
  runtime = globalThis.chrome?.runtime,
  scan = scanProductPage,
  createObserver = createProductPageObserver,
  now = () => new Date()
} = {}) {
  if (!locationLike || typeof locationLike.href !== 'string') {
    throw new TypeError('locationLike.href is required');
  }
  if (!documentLike) throw new TypeError('documentLike is required');
  const messageRuntime = assertRuntime(runtime);
  if (typeof scan !== 'function') throw new TypeError('scan is required');
  if (typeof createObserver !== 'function') throw new TypeError('createObserver is required');
  if (typeof now !== 'function') throw new TypeError('now is required');

  let started = false;
  let observer = null;
  let pending = Promise.resolve();

  async function scanAndEmit() {
    const result = scan({
      url: locationLike.href,
      documentLike,
      now: now()
    });

    if (result?.status !== 'detected' || !result.product) return result;

    const message = createExtensionMessage(MESSAGE_TYPES.PRODUCT_DETECTED, {
      product: result.product
    });

    try {
      await messageRuntime.sendMessage(message);
    } catch {
      // A product scan must not fail just because no extension view is listening yet.
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

      observer = createObserver({
        locationLike,
        onChange: () => {
          if (started) void queueScan();
        }
      });

      if (!observer || typeof observer.start !== 'function' || typeof observer.stop !== 'function') {
        started = false;
        observer = null;
        throw new TypeError('observer must provide start and stop');
      }

      observer.start();
      return queueScan();
    },
    stop() {
      if (!started) return;
      started = false;
      observer?.stop();
      observer = null;
    },
    flush() {
      return pending;
    }
  });
}

if (typeof document !== 'undefined' && globalThis.location && globalThis.chrome?.runtime?.sendMessage) {
  const bootstrap = createContentBootstrap();
  void bootstrap.start();
}
