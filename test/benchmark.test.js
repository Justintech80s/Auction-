import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { estimateValue } from '../src/valuation.js';

const fixtures = JSON.parse(await readFile(new URL('../benchmarks/fixtures.json', import.meta.url), 'utf8'));

test('benchmark fixtures remain within 10 percent absolute percentage error', () => {
  for (const fixture of fixtures) {
    const result = estimateValue(fixture.comparables);
    assert.equal(result.status, 'ok', fixture.name);
    const error = Math.abs(result.estimate - fixture.knownValue) / fixture.knownValue;
    assert.ok(error <= 0.1, `${fixture.name}: expected <=10% error, got ${(error * 100).toFixed(2)}%`);
  }
});
