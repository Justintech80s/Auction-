import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const manifest=JSON.parse(fs.readFileSync(new URL('../extension/manifest.json',import.meta.url),'utf8'));
test('popup remains configured while universal HTTPS scan coverage is enabled',()=>{assert.equal(manifest.action.default_popup,'popup/index.html');assert.ok(manifest.host_permissions.includes('https://*/*'));assert.ok(manifest.permissions.includes('activeTab'));assert.ok(manifest.permissions.includes('scripting'));});
