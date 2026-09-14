import { valueItem } from '../src/pipeline.js';
import { identifyProduct } from '../src/product-search/identify.js';
import { rankOffers } from '../src/product-search/ranker.js';
import { searchAcrossStores } from '../src/product-search/search.js';
import {
  createAuctionClient,
  mapProductToAuctionInput
} from './messaging/auction-client.js';
import {
  MESSAGE_TYPES,
  createExtensionMessage,
  validateExtensionMessage
} from './messaging/messages.js';

function projectAuctionResult(result = {}) {
  const valuation = result?.valuation ?? null;
  return Object.freeze({
    status: valuation?.status ?? 'unavailable',
    valuation,
    opportunity: result?.opportunity ?? null,
    soldEvidence: result?.soldEvidence ?? null,
    security: result?.security ?? null,
    provenance: Array.isArray(result?.provenance) ? result.provenance : []
  });
}

function assertRuntime(runtime) {
  if (!runtime?.onMessage || typeof runtime.onMessage.addListener !== 'function' || typeof runtime.onMessage.removeListener !== 'function') {
    throw new TypeError('chrome runtime message transport is required');
  }
  return runtime;
}

function hasRecommendedExact(groups = {}) {
  return Object.values(groups).some(group =>
    group?.cheapestItemId || group?.cheapestTotalId || group?.bestExactId
  );
}

function searchStatus({ offers, groups, providerErrors }) {
  const offerCount = Array.isArray(offers) ? offers.length : 0;
  const errorCount = Array.isArray(providerErrors) ? providerErrors.length : 0;

  if (offerCount === 0 && errorCount > 0) return 'provider_unavailable';
  if (!hasRecommendedExact(groups)) return 'no_exact_match';
  if (errorCount > 0) return 'partial_results';
  return 'complete';
}

export function createAuctionAnalysisHandler({
  valueItemImpl = valueItem,
  pipelineOptions = {}
} = {}) {
  if (typeof valueItemImpl !== 'function') throw new TypeError('valueItem implementation is required');
  if (!pipelineOptions || typeof pipelineOptions !== 'object' || Array.isArray(pipelineOptions)) {
    throw new TypeError('pipeline options must be an object');
  }

  return async function analyzeProduct(product, costs) {
    const mapped = mapProductToAuctionInput(product);
    const item = {
      ...mapped.item,
      marketplace: mapped.marketplace,
      url: mapped.url
    };

    const result = await valueItemImpl(item, {
      source: 'ebay',
      ...pipelineOptions,
      guardian: true,
      acquisitionPrice: mapped.acquisitionPrice,
      ...(costs === undefined ? {} : { costs })
    });

    return projectAuctionResult(result);
  };
}

export function createAuctionServiceWorker({
  runtime,
  analyze,
  valueItemImpl = valueItem,
  pipelineOptions = {},
  identifyProductImpl = identifyProduct,
  searchAcrossStoresImpl,
  rankOffersImpl = rankOffers,
  searchProviders = [],
  publish
} = {}) {
  const messageRuntime = assertRuntime(runtime);
  const analyzeProduct = analyze ?? createAuctionAnalysisHandler({ valueItemImpl, pipelineOptions });
  if (typeof analyzeProduct !== 'function') throw new TypeError('analyze function is required');
  if (typeof identifyProductImpl !== 'function') throw new TypeError('identifyProduct implementation is required');
  if (typeof rankOffersImpl !== 'function') throw new TypeError('rankOffers implementation is required');

  const searchStores = searchAcrossStoresImpl ?? ((identity) => searchAcrossStores(identity, {
    providers: searchProviders
  }));
  if (typeof searchStores !== 'function') throw new TypeError('searchAcrossStores implementation is required');

  const publishMessage = publish ?? (async (message) => {
    try {
      await globalThis.chrome?.runtime?.sendMessage?.(message);
    } catch {
      // Side panel or popup may have closed; search completion remains safe.
    }
  });
  if (typeof publishMessage !== 'function') throw new TypeError('publish function is required');

  const client = createAuctionClient({ analyze: analyzeProduct });
  let started = false;

  async function publishSafely(message) {
    try {
      await publishMessage(message);
    } catch {
      // Publishing is best-effort and must not break analysis/search work.
    }
  }

  async function searchIdentity(identity) {
    let searchResult;
    try {
      searchResult = await searchStores(identity);
    } catch {
      searchResult = {
        offers: [],
        providerErrors: [{ source: 'shopping', code: 'provider_unavailable' }]
      };
    }

    const rawOffers = Array.isArray(searchResult?.offers) ? searchResult.offers : [];
    const providerErrors = Array.isArray(searchResult?.providerErrors)
      ? searchResult.providerErrors
      : [{ source: 'shopping', code: 'provider_unavailable' }];

    let ranked;
    try {
      ranked = rankOffersImpl(identity, rawOffers);
    } catch {
      ranked = {
        identity,
        offers: [],
        groups: {}
      };
    }

    const result = createExtensionMessage(MESSAGE_TYPES.CROSS_STORE_SEARCH_RESULT, {
      status: searchStatus({
        offers: ranked.offers,
        groups: ranked.groups,
        providerErrors
      }),
      identity: ranked.identity ?? identity,
      offers: ranked.offers ?? [],
      groups: ranked.groups ?? {},
      providerErrors
    });

    await publishSafely(result);
    return result;
  }

  async function handleScan(payload) {
    let identified;
    try {
      identified = await identifyProductImpl(payload.evidence);
    } catch {
      identified = { status: 'unidentified', identity: null };
    }

    const status = ['identified', 'needs_confirmation', 'unidentified'].includes(identified?.status)
      ? identified.status
      : 'unidentified';
    const scanResult = createExtensionMessage(MESSAGE_TYPES.SCAN_ACTIVE_PRODUCT_RESULT, {
      status,
      identity: identified?.identity ?? null
    });
    await publishSafely(scanResult);

    if (status !== 'identified' || !scanResult.payload.identity) return scanResult;
    return searchIdentity(scanResult.payload.identity);
  }

  async function handleMessage(message) {
    if (message?.type === MESSAGE_TYPES.ANALYSIS_REQUEST) {
      return client.handleMessage(message);
    }

    let validated;
    try {
      validated = validateExtensionMessage(message);
    } catch {
      return client.handleMessage(message);
    }

    if (validated.type === MESSAGE_TYPES.SCAN_ACTIVE_PRODUCT_REQUEST) {
      return handleScan(validated.payload);
    }
    if (validated.type === MESSAGE_TYPES.CROSS_STORE_SEARCH_REQUEST) {
      return searchIdentity(validated.payload.identity);
    }

    return client.handleMessage(validated);
  }

  const listener = (message, _sender, sendResponse) => {
    Promise.resolve(handleMessage(message))
      .then((response) => sendResponse(response));
    return true;
  };

  return Object.freeze({
    start() {
      if (started) return;
      messageRuntime.onMessage.addListener(listener);
      started = true;
    },
    stop() {
      if (!started) return;
      messageRuntime.onMessage.removeListener(listener);
      started = false;
    }
  });
}

const chromeRuntime = globalThis.chrome?.runtime;
if (chromeRuntime?.onMessage?.addListener && chromeRuntime?.onMessage?.removeListener) {
  createAuctionServiceWorker({ runtime: chromeRuntime }).start();
}
