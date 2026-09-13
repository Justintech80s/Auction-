const DEFAULT_DEBOUNCE_MS = 250;
const MAX_DEBOUNCE_MS = 2000;
const MAX_MUTATION_RECORDS = 100;

function canonicalizeUrl(value) {
  try {
    const parsed = new URL(String(value ?? ''));
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return String(value ?? '').split('#')[0];
  }
}

function isMeaningfulMutation(record) {
  if (!record || typeof record !== 'object') return false;
  if (record.type === 'attributes' && record.attributeName === 'data-auction-observer') return false;
  return record.type === 'childList' || record.type === 'attributes' || record.type === 'characterData';
}

function hasMeaningfulMutation(records) {
  if (!Array.isArray(records) || records.length === 0) return false;
  return records.slice(0, MAX_MUTATION_RECORDS).some(isMeaningfulMutation);
}

function createDefaultMutationSource() {
  return {
    subscribe(callback) {
      if (typeof MutationObserver !== 'function' || typeof document === 'undefined') return () => {};
      const root = document.documentElement ?? document.body;
      if (!root) return () => {};

      const observer = new MutationObserver(records => callback(records));
      observer.observe(root, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true
      });
      return () => observer.disconnect();
    }
  };
}

export function createProductPageObserver({
  locationLike = globalThis.location,
  mutationSource = createDefaultMutationSource(),
  onChange,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  clock = globalThis
} = {}) {
  if (!locationLike || typeof locationLike.href !== 'string') throw new TypeError('locationLike.href is required');
  if (!mutationSource || typeof mutationSource.subscribe !== 'function') throw new TypeError('mutationSource.subscribe is required');
  if (typeof onChange !== 'function') throw new TypeError('onChange is required');
  if (!clock || typeof clock.setTimeout !== 'function' || typeof clock.clearTimeout !== 'function') {
    throw new TypeError('clock must provide setTimeout and clearTimeout');
  }

  const boundedDebounceMs = Math.min(MAX_DEBOUNCE_MS, Math.max(0, Number(debounceMs) || 0));
  let running = false;
  let unsubscribe = null;
  let timerId = null;
  let lastUrl = canonicalizeUrl(locationLike.href);
  let pendingReason = null;

  function cancelPending() {
    if (timerId != null) {
      clock.clearTimeout(timerId);
      timerId = null;
    }
    pendingReason = null;
  }

  function schedule(reason) {
    if (!running) return;
    pendingReason = pendingReason === 'url' || reason === 'url' ? 'url' : 'mutation';
    if (timerId != null) clock.clearTimeout(timerId);

    timerId = clock.setTimeout(() => {
      timerId = null;
      if (!running) return;

      const currentUrl = canonicalizeUrl(locationLike.href);
      const urlChanged = currentUrl !== lastUrl;
      const callbackReason = urlChanged ? 'url' : pendingReason;
      pendingReason = null;

      if (urlChanged) lastUrl = currentUrl;
      if (!callbackReason) return;
      onChange(Object.freeze({ reason: callbackReason, url: currentUrl }));
    }, boundedDebounceMs);
  }

  function handleMutations(records) {
    if (!running) return;
    const currentUrl = canonicalizeUrl(locationLike.href);
    if (currentUrl !== lastUrl) {
      schedule('url');
      return;
    }
    if (hasMeaningfulMutation(records)) schedule('mutation');
  }

  return Object.freeze({
    start() {
      if (running) return;
      running = true;
      lastUrl = canonicalizeUrl(locationLike.href);
      unsubscribe = mutationSource.subscribe(handleMutations) ?? null;
    },
    stop() {
      if (!running) return;
      running = false;
      cancelPending();
      if (typeof unsubscribe === 'function') unsubscribe();
      unsubscribe = null;
    }
  });
}
