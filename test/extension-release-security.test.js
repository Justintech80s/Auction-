import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const manifest=JSON.parse(fs.readFileSync(new URL('../extension/manifest.json',import.meta.url),'utf8'));
test('release manifest is MV3 with universal HTTPS scan coverage and no all_urls token',()=>{assert.equal(manifest.manifest_version,3);assert.equal(manifest.version,'1.0.0');assert.ok(manifest.host_permissions.includes('https://*/*'));assert.ok(!manifest.host_permissions.includes('<all_urls>'));});
