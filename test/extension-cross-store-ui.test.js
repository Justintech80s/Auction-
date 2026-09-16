import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html=fs.readFileSync(new URL('../extension/sidepanel/index.html',import.meta.url),'utf8');
test('side panel exposes unified online price comparison region',()=>{assert.match(html,/Prices Found Online/i);assert.match(html,/shared-comparison-list/);assert.match(html,/Best Price/i);assert.match(html,/Visit Store/i);});
