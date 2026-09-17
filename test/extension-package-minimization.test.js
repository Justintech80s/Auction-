import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildExtensionPackage } from '../scripts/build-extension.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

test('release package contains browser-reachable src only', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'auction-extension-'));
  const outputDir = path.join(tempRoot, 'extension');

  try {
    await buildExtensionPackage({ repoRoot, outputDir });

    assert.equal(await exists(path.join(outputDir, 'src', 'pipeline.js')), true);
    assert.equal(await exists(path.join(outputDir, 'src', 'connectors', 'product-search-backend.js')), true);
    assert.equal(await exists(path.join(outputDir, 'src', 'product-search', 'contracts.js')), true);
    assert.equal(await exists(path.join(outputDir, 'storage', 'scan-session.js')), true);
    assert.equal(await exists(path.join(outputDir, 'storage', 'cost-presets.js')), false);
    assert.equal(await exists(path.join(outputDir, 'storage', 'watchlist.js')), false);
    assert.equal(await exists(path.join(outputDir, 'storage', 'shared-backend-config.js')), false);

    assert.equal(await exists(path.join(outputDir, 'src', 'persistence')), false,
      'server-only persistence code must not ship in the browser extension');
    assert.equal(await exists(path.join(outputDir, 'src', 'product-search', 'providers')), false,
      'server-side shopping provider implementations must not ship in the browser extension');
    assert.equal(await exists(path.join(outputDir, 'src', 'persistence', 'postgres-runtime.js')), false,
      'database runtime must never ship in the browser extension');
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
