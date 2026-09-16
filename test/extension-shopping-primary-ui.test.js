import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html=fs.readFileSync(new URL('../extension/sidepanel/index.html',import.meta.url),'utf8');
test('shopping results are the primary and only purchase-comparison sidebar experience',()=>{assert.match(html,/Product Identified/);assert.match(html,/Current Website Price/);assert.match(html,/Prices Found Online/);assert.doesNotMatch(html,/Resale Analysis|Deal Costs|Saved Presets/);});
