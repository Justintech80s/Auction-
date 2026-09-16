import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html=fs.readFileSync(new URL('../extension/sidepanel/index.html',import.meta.url),'utf8');
test('shopping-first sidebar removes legacy cost preset controls',()=>{assert.doesNotMatch(html,/clear-default-cost-preset|cost-preset-name|Saved Presets/i);});
