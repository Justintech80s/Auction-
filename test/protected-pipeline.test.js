import test from 'node:test';
import assert from 'node:assert/strict';
import { valueItem } from '../src/pipeline.js';

test('protected pipeline adds deterministic risk and provenance without requiring AI', async () => {
  const result = await valueItem(
    { brand: 'Sony', model: 'WM-2', category: 'Walkman' },
    {
      source: 'fixture',
      guardian: true,
      search: async () => [
        { source: 'fixture', sourceId: '1', title: 'Sony WM-2 Walkman', price: 100, currency: 'USD', status: 'sold', evidenceType: 'sold' },
        { source: 'fixture', sourceId: '2', title: 'Sony WM-2 Walkman', price: 110, currency: 'USD', status: 'sold', evidenceType: 'sold' }
      ]
    }
  );

  assert.equal(result.valuation.status, 'ok');
  assert.equal(result.security.decision, 'allow');
  assert.equal(result.ai.status, 'disabled');
  assert.equal(result.provenance.length, 2);
  assert.deepEqual(result.provenance.map((item) => item.evidenceId), ['fixture:1', 'fixture:2']);
});

test('protected pipeline rejects manipulated sold-status evidence', async () => {
  const result = await valueItem(
    { brand: 'Sony', model: 'WM-2', category: 'Walkman' },
    {
      source: 'fixture',
      guardian: true,
      search: async () => [
        { source: 'fixture', sourceId: '1', title: 'Sony WM-2 Walkman', price: 100, currency: 'USD', status: 'sold', evidenceType: 'asking' },
        { source: 'fixture', sourceId: '2', title: 'Sony WM-2 Walkman', price: 105, currency: 'USD', status: 'sold', evidenceType: 'sold' }
      ]
    }
  );

  assert.equal(result.security.decision, 'reject');
  assert.ok(result.security.signals.some((signal) => signal.code === 'sold_status_mismatch'));
});

test('AI enrichment cannot override Guardian review or reject decisions', async () => {
  const result = await valueItem(
    { brand: 'Sony', model: 'WM-2', category: 'Walkman' },
    {
      source: 'fixture',
      guardian: true,
      aiProvider: async () => ({ classification: 'low_risk', confidence: 1, evidenceIds: ['fixture:1'], decision: 'allow' }),
      search: async () => [
        { source: '', sourceId: '', title: 'Sony WM-2 Walkman', price: 100, currency: 'USD', status: 'active' },
        { source: 'fixture', sourceId: '2', title: 'Sony WM-2 Walkman', price: 110, currency: 'USD', status: 'active' }
      ]
    }
  );

  assert.equal(result.security.decision, 'review');
  assert.equal(result.ai.effectiveDecision, 'review');
});