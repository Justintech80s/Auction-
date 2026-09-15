import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DEFAULT_REPO_ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');
const COPY_DIRECTORIES = Object.freeze([
  'adapters',
  'content',
  'messaging',
  'popup',
  'sidepanel',
  'storage'
]);

const BROWSER_SRC_ENTRIES = Object.freeze([
  'pipeline.js',
  'connectors/product-search-backend.js',
  'product-search/identify.js',
  'product-search/ranker.js',
  'product-search/search.js',
  'product-search/contracts.js'
]);

const STATIC_IMPORT_PATTERN = /(?:import|export)\s+(?:[^'";]*?\s+from\s+)?['"](\.[^'"]+)['"]/g;

function sourceRelativePath(sourceRoot, absolutePath) {
  const relative = path.relative(sourceRoot, absolutePath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('browser source dependency escaped src root');
  }
  return relative;
}

async function copyBrowserSourceGraph({ sourceRoot, outputRoot, entries = BROWSER_SRC_ENTRIES }) {
  const pending = entries.map(entry => path.resolve(sourceRoot, entry));
  const copied = new Set();

  while (pending.length > 0) {
    const absolutePath = pending.pop();
    const relativePath = sourceRelativePath(sourceRoot, absolutePath);
    if (copied.has(relativePath)) continue;

    const source = await readFile(absolutePath, 'utf8');
    copied.add(relativePath);

    const destination = path.join(outputRoot, relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, source, 'utf8');

    STATIC_IMPORT_PATTERN.lastIndex = 0;
    for (const match of source.matchAll(STATIC_IMPORT_PATTERN)) {
      const specifier = match[1];
      const resolved = path.resolve(path.dirname(absolutePath), specifier);
      const dependency = path.extname(resolved) ? resolved : `${resolved}.js`;
      sourceRelativePath(sourceRoot, dependency);
      pending.push(dependency);
    }
  }

  return copied;
}

export async function buildExtensionPackage({
  repoRoot = DEFAULT_REPO_ROOT,
  outputDir = path.join(repoRoot, 'dist', 'auction-extension')
} = {}) {
  const extensionRoot = path.join(repoRoot, 'extension');
  const sourceRoot = path.join(repoRoot, 'src');

  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });

  await cp(
    path.join(extensionRoot, 'manifest.json'),
    path.join(outputDir, 'manifest.json')
  );

  for (const directory of COPY_DIRECTORIES) {
    await cp(
      path.join(extensionRoot, directory),
      path.join(outputDir, directory),
      { recursive: true }
    );
  }

  const serviceWorkerSource = await readFile(
    path.join(extensionRoot, 'service-worker.js'),
    'utf8'
  );
  const releaseServiceWorker = serviceWorkerSource.replaceAll(
    "from '../src/",
    "from './src/"
  );

  if (releaseServiceWorker.includes("from '../src/")) {
    throw new Error('release service worker contains an import outside the extension package');
  }

  await writeFile(
    path.join(outputDir, 'service-worker.js'),
    releaseServiceWorker,
    'utf8'
  );

  const messagesSource = await readFile(
    path.join(extensionRoot, 'messaging', 'messages.js'),
    'utf8'
  );
  const releaseMessages = messagesSource.replace(
    "from '../../src/product-search/contracts.js';",
    "from '../src/product-search/contracts.js';"
  );

  if (releaseMessages.includes("from '../../src/")) {
    throw new Error('release messaging contains an import outside the extension package');
  }

  await writeFile(
    path.join(outputDir, 'messaging', 'messages.js'),
    releaseMessages,
    'utf8'
  );

  await copyBrowserSourceGraph({
    sourceRoot,
    outputRoot: path.join(outputDir, 'src')
  });

  return outputDir;
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  const outputDir = await buildExtensionPackage();
  console.log(`Built Auction extension package at ${outputDir}`);
}
