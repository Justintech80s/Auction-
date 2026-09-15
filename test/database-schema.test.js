import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql = await readFile(new URL('../database/migrations/001_auction_catalog.sql', import.meta.url), 'utf8');

for (const table of ['products', 'stores', 'offers', 'price_history']) {
  test(`migration creates auction.${table}`, () => {
    assert.match(sql, new RegExp(`create\\s+table\\s+auction\\.${table}`, 'i'));
  });
}

test('migration protects unsafe data and direct client access', () => {
  assert.match(sql, /https:\/\//i);
  assert.match(sql, /revoke\s+all\s+on\s+all\s+tables\s+in\s+schema\s+auction\s+from\s+anon/i);
  assert.match(sql, /revoke\s+all\s+on\s+all\s+tables\s+in\s+schema\s+auction\s+from\s+authenticated/i);
  assert.match(sql, /item_price\s+>=\s+0/i);
});
