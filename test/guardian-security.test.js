import test from 'node:test';
import assert from 'node:assert/strict';
import { validateGuardianRequest, safePublicError } from '../src/security/gateway.js';
import { validateOutboundUrl } from '../src/security/url-policy.js';
import { createMemoryRateLimiter } from '../src/security/rate-limit.js';
import { assessRisk } from '../src/security/risk-engine.js';
import { createMemoryEventStore, redactSecurityEvent } from '../src/security/events.js';

test('Guardian accepts bounded structured item requests', () => {
  const result = validateGuardianRequest({
    method: 'POST',
    body: { item: { brand: 'Sony', model: 'WM-2', category: 'Walkman' } },
    requestId: 'req-1'
  });
  assert.equal(result.ok, true);
  assert.equal(result.context.requestId, 'req-1');
});

test('Guardian rejects unsupported methods and oversized fields', () => {
  assert.throws(() => validateGuardianRequest({ method: 'TRACE', body: {} }), /method_not_allowed/);
  assert.throws(
    () => validateGuardianRequest({ method: 'POST', body: { item: { brand: 'x'.repeat(600) } } }),
    /invalid_input/
  );
});

test('safePublicError does not leak internal details', () => {
  const error = new Error('secret-token=abc123 internal stack detail');
  const publicError = safePublicError(error);
  assert.equal(publicError.code, 'internal_failure');
  assert.equal(publicError.message, 'The request could not be completed.');
  assert.doesNotMatch(JSON.stringify(publicError), /abc123|stack/i);
});

test('URL policy permits approved HTTPS hosts and blocks SSRF targets', () => {
  assert.equal(validateOutboundUrl('https://api.ebay.com/buy/browse/v1/item_summary/search', ['api.ebay.com']).hostname, 'api.ebay.com');
  for (const unsafe of [
    'http://api.ebay.com/path',
    'https://127.0.0.1/admin',
    'https://localhost/admin',
    'https://169.254.169.254/latest/meta-data',
    'https://user:pass@api.ebay.com/path',
    'https://evil.example/path'
  ]) {
    assert.throws(() => validateOutboundUrl(unsafe, ['api.ebay.com']), /blocked_outbound_url/);
  }
});

test('memory rate limiter blocks requests above the configured window budget', () => {
  const limiter = createMemoryRateLimiter({ limit: 2, windowMs: 60_000, now: () => 1000 });
  assert.equal(limiter.consume('client-a').allowed, true);
  assert.equal(limiter.consume('client-a').allowed, true);
  assert.equal(limiter.consume('client-a').allowed, false);
});

test('risk engine returns review for weak provenance and reject for critical manipulation', () => {
  const weak = assessRisk({
    item: { brand: 'Sony', model: 'WM-2' },
    comparables: [{ source: '', sourceId: '', title: 'Sony WM-2', price: 100, status: 'active', similarity: 1 }],
    valuation: { status: 'ok', estimate: 100, confidence: 0.8, soldCount: 0, askingCount: 1 }
  });
  assert.equal(weak.decision, 'review');
  assert.ok(weak.signals.some((signal) => signal.code === 'weak_provenance'));

  const manipulated = assessRisk({
    item: { brand: 'Sony', model: 'WM-2' },
    comparables: [
      { source: 'fixture', sourceId: '1', title: 'Sony WM-2', price: 100, status: 'sold', evidenceType: 'asking', similarity: 1 },
      { source: 'fixture', sourceId: '1', title: 'Sony WM-2 duplicate', price: 100, status: 'sold', evidenceType: 'sold', similarity: 1 }
    ],
    valuation: { status: 'ok', estimate: 100, confidence: 0.9, soldCount: 2, askingCount: 0 }
  });
  assert.equal(manipulated.decision, 'reject');
  assert.ok(manipulated.riskScore >= 0.8);
});

test('security event store redacts secrets and limits raw text', async () => {
  const store = createMemoryEventStore();
  const event = redactSecurityEvent({
    requestId: 'req-1',
    decision: 'review',
    reasonCodes: ['weak_provenance'],
    token: 'super-secret-token',
    description: 'x'.repeat(2000)
  });
  await store.write(event);
  const events = store.list();
  assert.equal(events.length, 1);
  assert.equal(events[0].token, undefined);
  assert.ok(events[0].description.length <= 256);
});