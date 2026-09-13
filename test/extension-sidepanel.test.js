import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPanelState, formatMoney, formatPercent } from '../extension/sidepanel/app.js';

test('builds the supported side panel states', () => {
  for (const state of ['idle', 'scanning', 'analyzing', 'unsupported', 'error']) {
    const panel = buildPanelState(state);
    assert.equal(panel.state, state);
    assert.equal(typeof panel.title, 'string');
    assert.ok(panel.title.length > 0);
  }
});

test('builds a result state from the Auction view model without changing its decision', () => {
  const panel = buildPanelState('result', {
    productTitle: 'Sony WM-2 Walkman',
    currentPrice: 129.99,
    currency: 'USD',
    estimatedValue: 220,
    valueRange: { low: 195, high: 245 },
    verifiedSoldCount: 6,
    potentialProfit: 90.01,
    confidence: 0.84,
    decision: 'buy',
    decisionReason: 'Auction returned buy.',
    riskState: 'allow',
    soldEvidenceState: 'ok'
  });

  assert.equal(panel.state, 'result');
  assert.equal(panel.decision, 'buy');
  assert.equal(panel.productTitle, 'Sony WM-2 Walkman');
  assert.equal(panel.currentPrice, '$129.99');
  assert.equal(panel.estimatedValue, '$220.00');
  assert.equal(panel.valueRange, '$195.00 – $245.00');
  assert.equal(panel.potentialProfit, '$90.01');
  assert.equal(panel.confidence, '84%');
  assert.equal(panel.verifiedSoldCount, '6');
  assert.equal(panel.riskState, 'allow');
  assert.equal(panel.soldEvidenceState, 'ok');
});

test('formats missing values conservatively', () => {
  assert.equal(formatMoney(null, 'USD'), '—');
  assert.equal(formatPercent(null), '—');

  const panel = buildPanelState('result', {
    productTitle: 'Unknown value item',
    currentPrice: null,
    estimatedValue: null,
    valueRange: null,
    verifiedSoldCount: 0,
    potentialProfit: null,
    confidence: 0,
    decision: 'manual_review',
    decisionReason: null,
    riskState: 'review',
    soldEvidenceState: 'unavailable',
    currency: 'USD'
  });

  assert.equal(panel.currentPrice, '—');
  assert.equal(panel.estimatedValue, '—');
  assert.equal(panel.potentialProfit, '—');
  assert.equal(panel.decision, 'manual_review');
});
