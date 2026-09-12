import assert from 'node:assert/strict';
import test from 'node:test';

import { createProductPageObserver } from '../extension/content/page-observer.js';

function createFakeClock() {
  let nextId = 1;
  const timers = new Map();

  return {
    setTimeout(fn) {
      const id = nextId++;
      timers.set(id, fn);
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    flush() {
      const pending = [...timers.values()];
      timers.clear();
      for (const fn of pending) fn();
    },
    pendingCount() {
      return timers.size;
    }
  };
}

function createMutationSource() {
  let listener = null;
  return {
    subscribe(callback) {
      listener = callback;
      return () => { listener = null; };
    },
    emit(records = [{ type: 'childList', addedNodes: [{}], removedNodes: [] }]) {
      listener?.(records);
    }
  };
}

test('URL changes trigger exactly one debounced callback', () => {
  const locationLike = { href: 'https://www.example.com/item/1#details' };
  const mutationSource = createMutationSource();
  const clock = createFakeClock();
  const changes = [];
  const observer = createProductPageObserver({
    locationLike,
    mutationSource,
    onChange: change => changes.push(change),
    debounceMs: 50,
    clock
  });

  observer.start();
  locationLike.href = 'https://www.example.com/item/2#reviews';
  mutationSource.emit();
  mutationSource.emit();

  assert.equal(clock.pendingCount(), 1);
  clock.flush();
  assert.equal(changes.length, 1);
  assert.equal(changes[0].reason, 'url');
  assert.equal(changes[0].url, 'https://www.example.com/item/2');
});

test('meaningful DOM mutations debounce to one rescan on the same URL', () => {
  const locationLike = { href: 'https://www.example.com/item/1' };
  const mutationSource = createMutationSource();
  const clock = createFakeClock();
  const changes = [];
  const observer = createProductPageObserver({
    locationLike,
    mutationSource,
    onChange: change => changes.push(change),
    debounceMs: 75,
    clock
  });

  observer.start();
  mutationSource.emit([{ type: 'childList', addedNodes: [{}], removedNodes: [] }]);
  mutationSource.emit([{ type: 'attributes', attributeName: 'class' }]);
  mutationSource.emit([{ type: 'characterData' }]);

  assert.equal(clock.pendingCount(), 1);
  clock.flush();
  assert.equal(changes.length, 1);
  assert.equal(changes[0].reason, 'mutation');
});

test('empty or irrelevant mutation batches do not retrigger', () => {
  const locationLike = { href: 'https://www.example.com/item/1' };
  const mutationSource = createMutationSource();
  const clock = createFakeClock();
  const changes = [];
  const observer = createProductPageObserver({
    locationLike,
    mutationSource,
    onChange: change => changes.push(change),
    clock
  });

  observer.start();
  mutationSource.emit([]);
  mutationSource.emit([{ type: 'attributes', attributeName: 'data-auction-observer' }]);
  clock.flush();

  assert.equal(changes.length, 0);
});

test('stop cancels pending work and prevents later callbacks', () => {
  const locationLike = { href: 'https://www.example.com/item/1' };
  const mutationSource = createMutationSource();
  const clock = createFakeClock();
  const changes = [];
  const observer = createProductPageObserver({
    locationLike,
    mutationSource,
    onChange: change => changes.push(change),
    clock
  });

  observer.start();
  mutationSource.emit();
  observer.stop();
  clock.flush();
  mutationSource.emit();
  clock.flush();

  assert.equal(changes.length, 0);
  assert.equal(clock.pendingCount(), 0);
});

test('start is idempotent and stop can be called repeatedly', () => {
  const locationLike = { href: 'https://www.example.com/item/1' };
  const mutationSource = createMutationSource();
  const clock = createFakeClock();
  let count = 0;
  const observer = createProductPageObserver({
    locationLike,
    mutationSource,
    onChange: () => { count += 1; },
    clock
  });

  observer.start();
  observer.start();
  mutationSource.emit();
  clock.flush();
  assert.equal(count, 1);

  observer.stop();
  observer.stop();
});
