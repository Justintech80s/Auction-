import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildExtensionPackage } from '../scripts/build-extension.mjs';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const EXPECTED_HOSTS = [
  'https://www.ebay.com/*',
  'https://www.amazon.com/*',
  'https://www.walmart.com/*',
  'https://www.bestbuy.com/*'
];

async function collectFiles(root) {
  const files = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(fullPath));
    else files.push(fullPath);
  }
  return files;
}

async function withBundle(fn) {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'auction-extension-'));
  const outputDir = path.join(tempRoot, 'auction-extension');
  try {
    await buildExtensionPackage({ repoRoot: REPO_ROOT, outputDir });
    await fn(outputDir);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

test('release bundle is a self-contained MV3 package with minimal explicit scan permissions', async () => {
  await withBundle(async (outputDir) => {
    const manifest = JSON.parse(await readFile(path.join(outputDir, 'manifest.json'), 'utf8'));

    assert.equal(manifest.manifest_version, 3);
    assert.deepEqual(manifest.permissions, ['sidePanel', 'storage', 'activeTab', 'scripting']);
    assert.deepEqual(manifest.host_permissions, EXPECTED_HOSTS);
    assert.equal(manifest.action.default_popup, 'popup/index.html');
    assert.ok(!JSON.stringify(manifest).includes('<all_urls>'));

    const workerPath = path.join(outputDir, manifest.background.service_worker);
    assert.equal((await stat(workerPath)).isFile(), true);
    assert.equal((await stat(path.join(outputDir, 'src', 'pipeline.js'))).isFile(), true);
    assert.equal((await stat(path.join(outputDir, 'src', 'product-search', 'contracts.js'))).isFile(), true);
    assert.equal((await stat(path.join(outputDir, manifest.action.default_popup))).isFile(), true);
    assert.equal((await stat(path.join(outputDir, 'content', 'active-scan.js'))).isFile(), true);

    const workerSource = await readFile(workerPath, 'utf8');
    assert.doesNotMatch(workerSource, /from\s+['"]\.\.\/src\//);
    assert.match(workerSource, /from\s+['"]\.\/src\/pipeline\.js['"]/);

    const messagesSource = await readFile(path.join(outputDir, 'messaging', 'messages.js'), 'utf8');
    assert.doesNotMatch(messagesSource, /from\s+['"]\.\.\/\.\.\/src\//);
    assert.match(messagesSource, /from\s+['"]\.\.\/src\/product-search\/contracts\.js['"]/);

    for (const contentScript of manifest.content_scripts || []) {
      for (const relativePath of contentScript.js || []) {
        assert.equal((await stat(path.join(outputDir, relativePath))).isFile(), true);
      }
    }

    assert.equal((await stat(path.join(outputDir, manifest.side_panel.default_path))).isFile(), true);
  });
});

test('release bundle contains no dynamic executable code, remote scripts, HTML injection sinks, or Node-only process.env access', async () => {
  await withBundle(async (outputDir) => {
    const files = (await collectFiles(outputDir)).filter((file) => /\.(?:js|mjs|html)$/i.test(file));
    assert.ok(files.length > 0);

    const forbidden = [
      [/\beval\s*\(/, 'eval'],
      [/\bnew\s+Function\s*\(/, 'new Function'],
      [/\.innerHTML\s*=/, 'innerHTML assignment'],
      [/\.outerHTML\s*=/, 'outerHTML assignment'],
      [/insertAdjacentHTML\s*\(/, 'insertAdjacentHTML'],
      [/document\.write\s*\(/, 'document.write'],
      [/from\s+['"]https?:\/\//, 'remote module import'],
      [/import\s*\(\s*['"]https?:\/\//, 'remote dynamic import'],
      [/<script[^>]+src\s*=\s*['"]https?:\/\//i, 'remote script'],
      [/\bprocess\.env\b/, 'Node-only process.env access']
    ];

    for (const file of files) {
      const source = await readFile(file, 'utf8');
      for (const [pattern, label] of forbidden) {
        assert.doesNotMatch(source, pattern, `${label} found in ${path.relative(outputDir, file)}`);
      }
    }
  });
});

test('release bundle contains no obvious committed credential material', async () => {
  await withBundle(async (outputDir) => {
    const files = (await collectFiles(outputDir)).filter((file) => /\.(?:js|mjs|json|html|css)$/i.test(file));
    const credentialPatterns = [
      /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
      /\bghp_[A-Za-z0-9]{20,}\b/,
      /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/,
      /\bAKIA[0-9A-Z]{16}\b/
    ];

    for (const file of files) {
      const source = await readFile(file, 'utf8');
      for (const pattern of credentialPatterns) {
        assert.doesNotMatch(source, pattern, `credential-like material found in ${path.relative(outputDir, file)}`);
      }
    }
  });
});
