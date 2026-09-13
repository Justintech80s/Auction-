import { assertMarketplaceAdapter, normalizeDetectedProduct } from '../adapters/contract.js';
import { ebayAdapter } from '../adapters/ebay.js';
import { amazonAdapter } from '../adapters/amazon.js';
import { walmartAdapter } from '../adapters/walmart.js';
import { bestBuyAdapter } from '../adapters/bestbuy.js';
import { genericAdapter } from '../adapters/generic.js';

const DEFAULT_ADAPTERS = Object.freeze([
  ebayAdapter,
  amazonAdapter,
  walmartAdapter,
  bestBuyAdapter,
  genericAdapter
]);

function orderedAdapters(adapters) {
  return [...adapters].sort((left, right) => {
    if (left?.name === 'generic') return 1;
    if (right?.name === 'generic') return -1;
    return 0;
  });
}

function unsupported(adapter = null) {
  return { status: 'unsupported', product: null, adapter };
}

function invalid(adapter = null) {
  return { status: 'invalid', product: null, adapter };
}

export function scanProductPage({
  url,
  documentLike,
  now = new Date(),
  adapters = DEFAULT_ADAPTERS
} = {}) {
  if (typeof url !== 'string' || !url.trim() || !Array.isArray(adapters)) {
    return invalid(null);
  }

  for (const candidate of orderedAdapters(adapters)) {
    let adapter;
    try {
      adapter = assertMarketplaceAdapter(candidate);
    } catch {
      return invalid(candidate?.name ?? null);
    }

    let matches;
    try {
      matches = adapter.matches(url, documentLike);
    } catch {
      return invalid(adapter.name);
    }

    if (!matches) continue;

    let extracted;
    try {
      extracted = adapter.extract(documentLike, { url, now });
    } catch {
      return invalid(adapter.name);
    }

    if (extracted == null) return unsupported(adapter.name);

    try {
      const product = normalizeDetectedProduct(extracted, { now });
      return { status: 'detected', product, adapter: adapter.name };
    } catch {
      return invalid(adapter.name);
    }
  }

  return unsupported(null);
}

export { DEFAULT_ADAPTERS };
