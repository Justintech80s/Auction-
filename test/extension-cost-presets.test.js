import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html=fs.readFileSync(new URL('../extension/sidepanel/index.html',import.meta.url),'utf8');
test('shopping sidebar no longer exposes manual cost preset controls',()=>{assert.doesNotMatch(html,/cost-preset-name|cost-preset-select|save-cost-preset|apply-cost-preset|set-default-cost-preset|delete-cost-preset/i);});
