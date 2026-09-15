import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateDatabaseUrl,
  validateProductionConfig,
  validateProductionScanResult
} from '../scripts/production-readiness.mjs';

test('production config requires a credential-free https product-scan endpoint', () => {
  assert.equal(validateProductionConfig({ endpoint: 'https://auction.example/api/product-scan' }).endpoint, 'https://auction.example/api/product-scan');
  assert.throws(() => validateProductionConfig({ endpoint: 'http://auction.example/api/product-scan' }));
  assert.throws(() => validateProductionConfig({ endpoint: 'https://user:pass@auction.example/api/product-scan' }));
  assert.throws(() => validateProductionConfig({ endpoint: 'https://auction.example/api/other' }));
});

test('database URL is optional but must be a PostgreSQL connection URL when supplied', () => {
  assert.equal(validateDatabaseUrl(), null);
  assert.equal(
    validateDatabaseUrl('postgresql://auction_user:secret@db.example.com:5432/postgres?sslmode=require'),
    'postgresql://auction_user:secret@db.example.com:5432/postgres?sslmode=require'
  );
  assert.equal(
    validateDatabaseUrl('postgres://auction_user:secret@db.example.com/postgres'),
    'postgres://auction_user:secret@db.example.com/postgres'
  );
  assert.throws(() => validateDatabaseUrl('https://db.example.com/postgres'), /PostgreSQL/);
  assert.throws(() => validateDatabaseUrl('postgresql://db.example.com/postgres'), /credentials/);
  assert.throws(() => validateDatabaseUrl('postgresql://auction_user@db.example.com/postgres'), /credentials/);
});

test('production scan validator accepts identified safe result states', () => {
  const result = validateProductionScanResult({
    status: 'provider_unavailable',
    identifiedProduct: { title: 'Dell Latitude 7420' },
    lowestPrice: null,
    priceComparison: [],
    providerErrors: [{ source: 'shopping', code: 'provider_unavailable' }]
  });
  assert.equal(result.status, 'provider_unavailable');
});

test('production scan validator rejects fabricated or unsafe lowest price links', () => {
  assert.throws(() => validateProductionScanResult({
    status: 'complete',
    identifiedProduct: { title: 'Dell Latitude 7420' },
    lowestPrice: { store: 'Bad', amount: 10, currency: 'USD', url: 'javascript:alert(1)' },
    priceComparison: [],
    providerErrors: []
  }));
});
