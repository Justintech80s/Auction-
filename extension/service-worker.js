import { valueItem } from '../src/pipeline.js';
import {
  createAuctionClient,
  mapProductToAuctionInput
} from './messaging/auction-client.js';

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
  pipelineOptions = {}
} = {}) {
  const messageRuntime = assertRuntime(runtime);
  const analyzeProduct = analyze ?? createAuctionAnalysisHandler({ valueItemImpl, pipelineOptions });
  if (typeof analyzeProduct !== 'function') throw new TypeError('analyze function is required');

  const client = createAuctionClient({ analyze: analyzeProduct });
  let started = false;

  const listener = (message, _sender, sendResponse) => {
    Promise.resolve(client.handleMessage(message))
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
