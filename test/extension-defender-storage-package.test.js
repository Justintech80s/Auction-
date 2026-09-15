import test from 'node:test';
import assert from 'node:assert/strict';
import { access, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const OUTPUT = 'dist/auction-extension';

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

test('release replaces Defender-flagged storage modules with consolidated browser storage', async () => {
  await rm(OUTPUT, { recursive: true, force: true });
  const build = spawnSync(process.execPath, ['scripts/build-extension.mjs'], { encoding: 'utf8' });
  assert.equal(build.status, 0, build.stderr || build.stdout);

  assert.equal(await exists(`${OUTPUT}/storage/watchlist.js`), false);
  assert.equal(await exists(`${OUTPUT}/storage/cost-presets.js`), false);
  assert.equal(await exists(`${OUTPUT}/storage/browser-storage.js`), true);
});
