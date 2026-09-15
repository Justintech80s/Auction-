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
import {
  createMemoryScanSessionStore,
  createScanSessionStore
} from './storage/scan-session.js';

export const SCAN_SESSION_REQUEST = 'AUCTION_SCAN_SESSION_REQUEST';
export const SCAN_SESSION_STATE = 'AUCTION_SCAN_SESSION_STATE';
export const SHARED_SCAN_RESULT = 'AUCTION_SHARED_SCAN_RESULT';

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

function scanId() {
  return `scan-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function sessionStateForSharedStatus(status) {
  if (status === 'complete') return 'complete';
  if (status === 'partial_results') return 'partial_results';
  if (status === 'needs_confirmation') return 'needs_confirmation';
  if (status === 'no_results') return 'no_results';
  if (status === 'provider_unavailable') return 'provider_unavailable';
  return 'error';
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
  sharedBackend = null,
  scanSessionStore = createMemoryScanSessionStore(),
  publish
} = {}) {
  const messageRuntime = assertRuntime(runtime);
  const analyzeProduct = analyze ?? createAuctionAnalysisHandler({ valueItemImpl, pipelineOptions });
  if (typeof analyzeProduct !== 'function') throw new TypeError('analyze function is required');
  if (typeof identifyProductImpl !== 'function') throw new TypeError('identifyProduct implementation is required');
  if (typeof rankOffersImpl !== 'function') throw new TypeError('rankOffers implementation is required');
  if (!scanSessionStore || typeof scanSessionStore.get !== 'function' || typeof scanSessionStore.set !== 'function') {
    throw new TypeError('scanSessionStore must provide get and set');
  }
  if (sharedBackend !== null && typeof sharedBackend?.scanProduct !== 'function') {
    throw new TypeError('sharedBackend must provide scanProduct');
  }

  const searchStores = searchAcrossStoresImpl ?? ((identity) => searchAcrossStores(identity, {
    providers: searchProviders
  }));
  if (typeof searchStores !== 'function') throw new TypeError('searchAcrossStores implementation is required');

  const publishMessage = publish ?? (async (message) => {
    try {
      await globalThis.chrome?.runtime?.sendMessage?.(message);
    } catch {
      // Side panel or popup may have closed; persisted scan state remains available.
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

  async function persistSession(session) {
    try {
      return await scanSessionStore.set(session);
    } catch {
      return null;
    }
  }

  async function publishSession(session) {
    const stored = await persistSession(session);
    const message = Object.freeze({
      type: SCAN_SESSION_STATE,
      payload: stored ?? session
    });
    await publishSafely(message);
    return message;
  }

  async function searchIdentity(identity, context = {}) {
    await publishSession({
      scanId: context.scanId ?? null,
      tabId: context.tabId ?? null,
      sourceUrl: context.sourceUrl ?? identity?.sourceUrl ?? null,
      state: 'searching_stores',
      identifiedProduct: identity ? {
        title: identity.title,
        brand: identity.brand,
        model: identity.model,
        features: Object.entries(identity.specs ?? {}).slice(0, 12).map(([key, value]) => `${key}: ${value}`),
        imageUrl: identity.imageUrl,
        confidence: identity.confidence
      } : null,
      result: null,
      updatedAt: new Date().toISOString()
    });

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
    const legacyStatus = result.payload.status;
    await publishSession({
      scanId: context.scanId ?? null,
      tabId: context.tabId ?? null,
      sourceUrl: context.sourceUrl ?? identity?.sourceUrl ?? null,
      state: legacyStatus === 'complete'
        ? 'complete'
        : legacyStatus === 'partial_results'
          ? 'partial_results'
          : legacyStatus === 'provider_unavailable'
            ? 'provider_unavailable'
            : 'no_results',
      identifiedProduct: identity ? {
        title: identity.title,
        brand: identity.brand,
        model: identity.model,
        features: Object.entries(identity.specs ?? {}).slice(0, 12).map(([key, value]) => `${key}: ${value}`),
        imageUrl: identity.imageUrl,
        confidence: identity.confidence
      } : null,
      result: { legacySearch: result.payload },
      updatedAt: new Date().toISOString()
    });
    return result;
  }

  async function handleSharedScan(payload, context) {
    await publishSession({
      scanId: context.scanId,
      tabId: payload.tabId,
      sourceUrl: payload.evidence.sourceUrl,
      state: 'identifying',
      identifiedProduct: null,
      result: null,
      updatedAt: new Date().toISOString()
    });

    let sharedResult;
    try {
      sharedResult = await sharedBackend.scanProduct(payload.evidence);
    } catch {
      sharedResult = {
        status: 'provider_unavailable',
        identifiedProduct: null,
        lowestPrice: null,
        priceComparison: [],
        savingsTips: [],
        providerErrors: [{ source: 'shared_backend', code: 'provider_unavailable' }]
      };
    }

    const finalSession = {
      scanId: context.scanId,
      tabId: payload.tabId,
      sourceUrl: payload.evidence.sourceUrl,
      state: sessionStateForSharedStatus(sharedResult.status),
      identifiedProduct: sharedResult.identifiedProduct ?? null,
      result: sharedResult,
      errorCode: sharedResult.status === 'error' ? 'shared_backend_error' : null,
      updatedAt: new Date().toISOString()
    };
    await publishSession(finalSession);

    const response = Object.freeze({
      type: SHARED_SCAN_RESULT,
      payload: sharedResult
    });
    await publishSafely(response);
    return response;
  }

  async function handleScan(payload) {
    const context = {
      scanId: scanId(),
      tabId: payload.tabId,
      sourceUrl: payload.evidence?.sourceUrl ?? null
    };

    await publishSession({
      ...context,
      state: 'scanning',
      identifiedProduct: null,
      result: null,
      updatedAt: new Date().toISOString()
    });

    if (sharedBackend) return handleSharedScan(payload, context);

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

    if (status !== 'identified' || !scanResult.payload.identity) {
      await publishSession({
        ...context,
        state: status === 'needs_confirmation' ? 'needs_confirmation' : 'error',
        identifiedProduct: null,
        result: null,
        errorCode: status === 'unidentified' ? 'unidentified' : null,
        updatedAt: new Date().toISOString()
      });
      return scanResult;
    }
    return searchIdentity(scanResult.payload.identity, context);
  }

  async function handleMessage(message) {
    if (message?.type === SCAN_SESSION_REQUEST) {
      return Object.freeze({
        type: SCAN_SESSION_STATE,
        payload: await scanSessionStore.get()
      });
    }

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
  const sessionArea = globalThis.chrome?.storage?.session;
  const sessionStore = sessionArea
    ? createScanSessionStore(sessionArea)
    : createMemoryScanSessionStore();
  createAuctionServiceWorker({ runtime: chromeRuntime, scanSessionStore: sessionStore }).start();
}
