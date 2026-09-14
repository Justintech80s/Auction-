import assert from 'node:assert/strict';

export function workerScanHarness() {
  let listener = null;
  const published = [];

  const runtime = {
    onMessage: {
      addListener(fn) { listener = fn; },
      removeListener(fn) { if (listener === fn) listener = null; }
    }
  };

  return Object.freeze({
    runtime,
    published,
    publish(message) {
      published.push(message);
    },
    async dispatch(message) {
      assert.equal(typeof listener, 'function');
      return new Promise((resolve) => {
        const keepOpen = listener(message, { id: 'auction-extension' }, resolve);
        assert.equal(keepOpen, true);
      });
    },
    hasListener() {
      return typeof listener === 'function';
    }
  });
}
