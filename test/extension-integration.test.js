import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const manifest=JSON.parse(fs.readFileSync(new URL('../extension/manifest.json',import.meta.url),'utf8'));
test('MV3 extension has universal HTTPS shopping coverage plus Auction API',()=>{assert.equal(manifest.manifest_version,3);assert.ok(manifest.permissions.includes('sidePanel'));assert.ok(manifest.permissions.includes('storage'));assert.ok(manifest.permissions.includes('activeTab'));assert.ok(manifest.permissions.includes('scripting'));assert.ok(manifest.host_permissions.includes('https://*/*'));assert.ok(manifest.host_permissions.includes('https://auction-jays-list.vercel.app/*'));assert.ok(manifest.content_scripts.some(s=>s.matches.includes('https://*/*')));});
