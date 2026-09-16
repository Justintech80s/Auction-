import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
test('extension runs on HTTPS shopping and checkout pages instead of a fixed merchant allowlist', () => { const manifest = JSON.parse(read('extension/manifest.json')); assert.ok(manifest.host_permissions.includes('https://*/*')); assert.ok(manifest.content_scripts.some((script) => script.matches.includes('https://*/*'))); });
test('shopping sidebar is price-comparison-first and removes manual resale cost controls', () => { const html=read('extension/sidepanel/index.html'); assert.match(html,/Prices Found Online/i); assert.match(html,/Best Price/i); assert.match(html,/Save/i); assert.match(html,/Visit Store/i); assert.doesNotMatch(html,/Saved Presets/i); assert.doesNotMatch(html,/Marketplace fee/i); assert.doesNotMatch(html,/Payment processing/i); assert.doesNotMatch(html,/Holding cost/i); });
test('checkout detector is present and avoids sensitive payment fields', () => { const source=read('extension/content/checkout.js'); assert.match(source,/coupon|promo/i); assert.match(source,/order|checkout|cart/i); assert.match(source,/price|total/i); assert.doesNotMatch(source,/cardNumber|cvv|password|authToken/i); });
test('Scan path includes image evidence for product identification', () => { const source=read('extension/content/index.js'); assert.match(source,/image/i); assert.match(source,/scan/i); });
