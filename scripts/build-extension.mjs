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
  const releaseServiceWorker = serviceWorkerSource.replace(
    "from '../src/pipeline.js';",
    "from './src/pipeline.js';"
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

  await cp(sourceRoot, path.join(outputDir, 'src'), { recursive: true });

  return outputDir;
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  const outputDir = await buildExtensionPackage();
  console.log(`Built Auction extension package at ${outputDir}`);
}
