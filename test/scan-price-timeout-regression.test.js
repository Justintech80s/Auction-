import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { collectActiveProductEvidence } from '../extension/content/active-scan.js';
import { fakeScanDocument } from './helpers/active-scan-dom.js';

test('manual scan captures Rawlings-style visible product price and USD currency', () => {
  const documentLike = fakeScanDocument({
    title: 'Rawlings 22" Pro Ash One Hand Bat Trainer ONEHANDBAT',
    selectors: {
      'meta[property="og:title"]': { content: 'Rawlings 22" Pro Ash One Hand Bat Trainer ONEHANDBAT' },
      'meta[property="og:image"]': { content: 'https://images.example/rawlings-bat.jpg' },
      '[itemprop="price"]': { content: '39.95', textContent: '$39.95' },
      '[itemprop="priceCurrency"]': { content: 'USD' }
    }
  });
  const result = collectActiveProductEvidence({ documentLike, locationLike: { href: 'https://ebasesloaded.com/rawlings-bat.html' }, now: '2026-09-16T22:30:00Z' });
  assert.equal(result.observedPrice, 39.95);
  assert.equal(result.observedCurrency, 'USD');
});

test('popup scan has a bounded timeout and no user-facing Shared backend controls', () => {
  const app = fs.readFileSync(new URL('../extension/popup/app.js', import.meta.url), 'utf8');
  const html = fs.readFileSync(new URL('../extension/popup/index.html', import.meta.url), 'utf8');
  assert.match(app, /timeout/i);
  assert.doesNotMatch(html, /Shared backend/i);
  assert.doesNotMatch(app, /createSharedBackendConfigStore/);
});
