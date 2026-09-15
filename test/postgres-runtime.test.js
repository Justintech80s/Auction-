import test from 'node:test';
import assert from 'node:assert/strict';
import { createPostgresCatalogFromEnv } from '../src/persistence/postgres-runtime.js';

test('database runtime stays disabled when AUCTION_DATABASE_URL is absent', async () => {
  let imported = false;
  const catalog = await createPostgresCatalogFromEnv({
    env: {},
    importPg: async () => {
      imported = true;
      return {};
    }
  });
  assert.equal(catalog, null);
  assert.equal(imported, false);
});

test('database runtime creates a server-only pg pool and transactional catalog', async () => {
  const constructed = [];
  class FakePool {
    constructor(options) {
      constructed.push(options);
    }
    async connect() {
      return {
        async query() {
          return { rows: [] };
        },
        release() {}
      };
    }
  }

  const catalog = await createPostgresCatalogFromEnv({
    env: { AUCTION_DATABASE_URL: 'postgresql://auction_user:secret@db.example.com/postgres?sslmode=require' },
    importPg: async () => ({ Pool: FakePool })
  });

  assert.equal(typeof catalog.persistScanResult, 'function');
  assert.equal(constructed.length, 1);
  assert.equal(constructed[0].connectionString, 'postgresql://auction_user:secret@db.example.com/postgres?sslmode=require');
  assert.equal(constructed[0].max, 3);
});

test('database runtime rejects non-PostgreSQL or incomplete connection URLs', async () => {
  const importPg = async () => ({ Pool: class {} });
  await assert.rejects(
    () => createPostgresCatalogFromEnv({ env: { AUCTION_DATABASE_URL: 'https://db.example.com/postgres' }, importPg }),
    /invalid_database_url/
  );
  await assert.rejects(
    () => createPostgresCatalogFromEnv({ env: { AUCTION_DATABASE_URL: 'postgresql://db.example.com/postgres' }, importPg }),
    /invalid_database_url/
  );
});
