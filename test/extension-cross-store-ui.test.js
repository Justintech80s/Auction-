import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createSidePanelApp } from '../extension/sidepanel/app.js';
import { createExtensionMessage, MESSAGE_TYPES } from '../extension/messaging/messages.js';
import { dellIdentity, dellOffer } from './helpers/product-search-fixtures.js';
import { sidepanelSearchHarness } from './helpers/sidepanel-search-harness.js';

const emptyGroup = Object.freeze({
  offerIds: [],
  cheapestItemId: null,
  cheapestTotalId: null,
  bestExactId: null
});

function searchMessage(status = 'complete') {
  const offers = [
    dellOffer({
      source: 'trusted-new',
      sourceId: 'new-1',
      store: 'Trusted New',
      condition: 'new',
      itemPrice: 299,
      shipping: 0,
      url: 'https://trusted.example/new',
      matchClassification: 'exact',
      matchScore: 0.98,
      guardianDecision: 'allow'
    }),
    dellOffer({
      source: 'trusted-refurb',
      sourceId: 'refurb-1',
      store: 'Trusted Refurb',
      condition: 'refurbished',
      itemPrice: 249,
      shipping: 10,
      url: 'https://trusted.example/refurb',
      matchClassification: 'exact',
      matchScore: 0.96,
      guardianDecision: 'allow'
    }),
    dellOffer({
      source: 'broad-used',
      sourceId: 'used-1',
      store: 'Broad Used',
      condition: 'used',
      itemPrice: 199,
      shipping: null,
      url: 'https://broad.example/used',
      trustTier: 'broad',
      matchClassification: 'similar',
      matchScore: 0.72,
      guardianDecision: 'review'
    })
  ];

  return createExtensionMessage(MESSAGE_TYPES.CROSS_STORE_SEARCH_RESULT, {
    status,
    identity: dellIdentity(),
    offers,
    groups: {
      new: {
        offerIds: ['trusted-new:new-1'],
        cheapestItemId: 'trusted-new:new-1',
        cheapestTotalId: 'trusted-new:new-1',
        bestExactId: 'trusted-new:new-1'
      },
      refurbished: {
        offerIds: ['trusted-refurb:refurb-1'],
        cheapestItemId: 'trusted-refurb:refurb-1',
        cheapestTotalId: 'trusted-refurb:refurb-1',
        bestExactId: 'trusted-refurb:refurb-1'
      },
      used: {
        offerIds: ['broad-used:used-1'],
        cheapestItemId: null,
        cheapestTotalId: null,
        bestExactId: null
      },
      unknown: emptyGroup
    },
    providerErrors: status === 'partial_results'
      ? [{ source: 'store-down', code: 'provider_unavailable' }]
      : []
  });
}

test('side panel markup exposes condition-separated cross-store result regions', async () => {
  const html = await readFile(new URL('../extension/sidepanel/index.html', import.meta.url), 'utf8');
  for (const id of ['cross-store-search', 'search-new-offers', 'search-refurbished-offers', 'search-used-offers', 'search-unknown-offers']) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
});

test('worker-normalized search messages preserve match and Guardian display metadata', () => {
  const message = searchMessage();
  const used = message.payload.offers.find(offer => offer.offerId === 'broad-used:used-1');
  assert.equal(used.matchClassification, 'similar');
  assert.equal(used.matchScore, 0.72);
  assert.equal(used.guardianDecision, 'review');
});

test('identified scan state transitions the side panel into store search', () => {
  const harness = sidepanelSearchHarness();
  createSidePanelApp({ documentLike: harness.documentLike, runtime: harness.runtime });

  harness.emit(createExtensionMessage(MESSAGE_TYPES.SCAN_ACTIVE_PRODUCT_RESULT, {
    status: 'identified',
    identity: dellIdentity()
  }));

  assert.equal(harness.element('panel-state').textContent, 'searching-stores');
  assert.match(harness.element('panel-title').textContent, /Searching stores/i);
});

test('needs-confirmation scan state does not pretend prices are exact', () => {
  const harness = sidepanelSearchHarness();
  createSidePanelApp({ documentLike: harness.documentLike, runtime: harness.runtime });

  harness.emit(createExtensionMessage(MESSAGE_TYPES.SCAN_ACTIVE_PRODUCT_RESULT, {
    status: 'needs_confirmation',
    identity: dellIdentity({ confidence: 0.61 })
  }));

  assert.equal(harness.element('panel-state').textContent, 'needs-confirmation');
  assert.match(harness.element('panel-message').textContent, /confirm/i);
});

test('renders New, Refurbished, and Used offers separately with direct safe Buy links', () => {
  const harness = sidepanelSearchHarness();
  createSidePanelApp({ documentLike: harness.documentLike, runtime: harness.runtime });
  harness.emit(searchMessage());

  assert.equal(harness.element('cross-store-search').hidden, false);
  assert.equal(harness.element('panel-state').textContent, 'complete-results');
  assert.equal(harness.element('search-new-offers').children.length, 1);
  assert.equal(harness.element('search-refurbished-offers').children.length, 1);
  assert.equal(harness.element('search-used-offers').children.length, 1);

  const newCard = harness.element('search-new-offers').children[0];
  const newBuy = newCard.children.find(child => child.tagName === 'A');
  assert.equal(newBuy.href, 'https://trusted.example/new');
  assert.equal(newBuy.target, '_blank');
  assert.match(newBuy.rel, /noopener/);
  assert.match(newCard.textContent, /Cheapest item/i);
  assert.match(newCard.textContent, /Best exact match/i);

  const usedCard = harness.element('search-used-offers').children[0];
  assert.match(usedCard.textContent, /Similar/i);
  assert.match(usedCard.textContent, /Guardian review/i);
  assert.doesNotMatch(usedCard.textContent, /Cheapest item/i);
});

test('partial provider failure keeps offers visible and reports partial results', () => {
  const harness = sidepanelSearchHarness();
  createSidePanelApp({ documentLike: harness.documentLike, runtime: harness.runtime });
  harness.emit(searchMessage('partial_results'));

  assert.equal(harness.element('panel-state').textContent, 'partial-results');
  assert.equal(harness.element('search-new-offers').children.length, 1);
  assert.match(harness.element('search-provider-status').textContent, /1 source unavailable/i);
});
