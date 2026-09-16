import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html=fs.readFileSync(new URL('../extension/sidepanel/index.html',import.meta.url),'utf8');
test('side panel exposes shopping comparison and price history outputs',()=>{for(const id of ['shared-current-price','shared-lowest-price','shared-save-amount','shared-comparison-list','price-history','history-current-price']) assert.match(html,new RegExp(`id=["']${id}["']`));assert.doesNotMatch(html,/cost-marketplace-fee|cost-payment-processing|cost-holding/);});
