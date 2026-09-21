import { searchAcrossStores } from '../src/product-search/search.js';
import { discoverAcrossQueries } from '../src/product-search/discovery.js';
import { rankOffers } from '../src/product-search/ranker.js';
import { createEbayBrowseProvider } from '../src/product-search/providers/ebay-browse.js';
import { createOpenAiVisionProvider } from '../src/product-search/providers/openai-vision.js';
import { createSerpApiShoppingProvider } from '../src/product-search/providers/serpapi-shopping.js';
import { createSerpApiLensProvider } from '../src/product-search/providers/serpapi-lens.js';
import { toCatalogRecords } from '../src/persistence/catalog-records.js';
import { createPostgresCatalogFromEnv } from '../src/persistence/postgres-runtime.js';

const MAX_TEXT = 240;
const MAX_FEATURES = 12;
let catalogPromise = null;

function cleanText(value, max = MAX_TEXT) {
  if (typeof value !== 'string') return null;
  const text = value.trim().replace(/\s+/g, ' ');
  return text ? text.slice(0, max) : null;
}

function httpsUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function cleanObject(input, maxEntries = 20) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  return Object.fromEntries(Object.entries(input).slice(0, maxEntries).map(([key, value]) => [
    cleanText(key, 64) || 'field',
    cleanText(String(value ?? ''), 120) || ''
  ]));
}

function positiveMoney(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : null;
}

function cleanCurrency(value) {
  const currency = cleanText(value, 3)?.toUpperCase();
  return /^[A-Z]{3}$/.test(currency ?? '') ? currency : null;
}

function normalizeEvidence(input) {
  const evidence = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  return {
    sourceUrl: httpsUrl(evidence.sourceUrl),
    pageTitle: cleanText(evidence.pageTitle),
    title: cleanText(evidence.title),
    brand: cleanText(evidence.brand, 100),
    model: cleanText(evidence.model, 100),
    category: cleanText(evidence.category, 100),
    condition: cleanText(evidence.condition, 40),
    identifiers: cleanObject(evidence.identifiers, 12),
    specs: cleanObject(evidence.specs, 20),
    imageUrl: httpsUrl(evidence.imageUrl),
    observedPrice: positiveMoney(evidence.observedPrice),
    observedCurrency: cleanCurrency(evidence.observedCurrency),
    confidence: Number.isFinite(Number(evidence.confidence))
      ? Math.max(0, Math.min(1, Number(evidence.confidence)))
      : 0
  };
}

function featuresFromEvidence(evidence) {
  return Object.entries(evidence.specs)
    .filter(([, value]) => value)
    .slice(0, MAX_FEATURES)
    .map(([key, value]) => `${key}: ${value}`);
}

function identifiedProduct(evidence) {
  const title = evidence.title || evidence.pageTitle;
  if (!title) return null;
  return {
    title,
    brand: evidence.brand,
    model: evidence.model,
    features: featuresFromEvidence(evidence),
    imageUrl: evidence.imageUrl,
    confidence: evidence.confidence
  };
}

function identityFromEvidence(evidence) {
  const title = evidence.title || evidence.pageTitle;
  if (!title) return null;
  return {
    title,
    brand: evidence.brand,
    model: evidence.model,
    category: evidence.category,
    condition: evidence.condition,
    identifiers: evidence.identifiers,
    specs: evidence.specs,
    sourceUrl: evidence.sourceUrl,
    imageUrl: evidence.imageUrl,
    confidence: evidence.confidence,
    capturedAt: new Date().toISOString()
  };
}

function sharedOffer(offer) {
  return {
    store: offer.store,
    title: offer.title,
    price: offer.itemPrice,
    currency: offer.currency,
    shipping: offer.shipping,
    estimatedTotal: offer.estimatedTotal,
    condition: offer.condition,
    description: null,
    url: offer.url,
    imageUrl: offer.imageUrl,
    matchConfidence: offer.matchScore,
    guardianDecision: offer.guardianDecision
  };
}

function deliveredValue(offer) {
  return offer.estimatedTotal ?? offer.itemPrice;
}

function lowestSharedOffer(offers) {
  const lowest = [...offers].sort((a, b) => deliveredValue(a) - deliveredValue(b) || a.itemPrice - b.itemPrice)[0];
  if (!lowest) return null;
  return {
    amount: lowest.itemPrice,
    currency: lowest.currency,
    store: lowest.store,
    url: lowest.url,
    shipping: lowest.shipping,
    estimatedTotal: lowest.estimatedTotal,
    condition: lowest.condition
  };
}

function pagePrice(evidence) {
  if (!evidence.observedPrice || !evidence.observedCurrency) return null;
  return { amount: evidence.observedPrice, currency: evidence.observedCurrency };
}

function savingsFrom(page, lowest) {
  if (!page || !lowest || page.currency !== lowest.currency) return null;
  const bestTotal = Number(lowest.estimatedTotal ?? lowest.amount);
  if (!Number.isFinite(bestTotal)) return null;
  const amount = Math.round((page.amount - bestTotal) * 100) / 100;
  return amount > 0 ? { amount, currency: page.currency } : null;
}

function savingsMessage(savings, lowest) {
  if (!savings || !lowest) return null;
  try {
    const formatted = new Intl.NumberFormat('en-US', {
      style: 'currency', currency: savings.currency, minimumFractionDigits: 2, maximumFractionDigits: 2
    }).format(savings.amount);
    return `You can save ${formatted} versus this page with the lowest verified delivered offer from ${lowest.store}.`;
  } catch {
    return null;
  }
}

function configuredProviders(env = process.env) {
  const providers = [];

  const serpApiKey = String(env?.SERPAPI_API_KEY ?? '').trim();
  if (serpApiKey) {
    try { providers.push(createSerpApiShoppingProvider({ apiKey: serpApiKey })); } catch {}
  }

  const clientId = String(env?.EBAY_CLIENT_ID ?? '').trim();
  const clientSecret = String(env?.EBAY_CLIENT_SECRET ?? '').trim();
  if (clientId && clientSecret) {
    try { providers.push(createEbayBrowseProvider({ clientId, clientSecret })); } catch {}
  }

  return providers;
}

async function configuredCatalog(env = process.env) {
  if (!String(env?.AUCTION_DATABASE_URL ?? '').trim()) return null;
  if (!catalogPromise) {
    catalogPromise = createPostgresCatalogFromEnv({ env }).catch(() => null);
  }
  return catalogPromise;
}

async function persistSafeExactOffers(catalog, evidence, product, offers) {
  if (!catalog || typeof catalog.persistScanResult !== 'function') return;

  for (const offer of offers) {
    const records = toCatalogRecords({ evidence, identifiedProduct: product, offer });
    if (!records) continue;
    try {
      await catalog.persistScanResult(records);
    } catch {
      // Persistence is best-effort. Database failures must never alter or leak into live pricing results.
    }
  }
}

export async function handleProductScan(payload, { providers = [], catalog = null, visualProvider = null } = {}) {
  if (!payload || payload.action !== 'product_scan') {
    return { statusCode: 400, body: { status: 'error' } };
  }

  let evidence = normalizeEvidence(payload.evidence);
  if (payload?.image?.dataUrl && typeof visualProvider?.identifyProduct === 'function') {
    try {
      const vision = await visualProvider.identifyProduct({ dataUrl: payload.image.dataUrl, mimeType: payload.image.mimeType });
      if (vision?.title) evidence = normalizeEvidence({ ...evidence, ...vision });
    } catch { /* safe fallback below */ }
  }
  const product = identifiedProduct(evidence);
  const currentPagePrice = pagePrice(evidence);

  if (!product) {
    return { statusCode: 200, body: { status: 'needs_confirmation', identifiedProduct: null, currentPagePrice, lowestPrice: null, savings: null, priceComparison: [], savingsTips: ['Open a clear product page with a visible title or model and scan again.'], providerErrors: [] } };
  }

  const identity = identityFromEvidence(evidence);
  if (!identity || !Array.isArray(providers) || providers.length === 0) {
    return { statusCode: 200, body: { status: 'provider_unavailable', identifiedProduct: product, currentPagePrice, lowestPrice: null, savings: null, priceComparison: [], savingsTips: ['Live store pricing is not connected yet.', 'Compare delivered totals, condition, and return policy before buying.'], providerErrors: [{ source: 'shopping', code: 'provider_unavailable' }] } };
  }

  let searched;
  try {
    searched = await discoverAcrossQueries(identity, { providers, searchAcrossStoresImpl: searchAcrossStores });
  } catch {
    searched = { offers: [], providerErrors: [{ source: 'shopping', code: 'provider_unavailable' }] };
  }

  let ranked;
  try {
    ranked = rankOffers(identity, searched.offers);
  } catch {
    ranked = { offers: [] };
  }

  const safeExact = (ranked.offers ?? []).filter(offer => offer.matchClassification === 'exact' && offer.guardianDecision === 'allow');
  await persistSafeExactOffers(catalog, evidence, product, safeExact);

  const comparison = safeExact.map(sharedOffer);
  const errors = Array.isArray(searched.providerErrors) ? searched.providerErrors : [];
  const lowestPrice = lowestSharedOffer(safeExact);
  const savings = savingsFrom(currentPagePrice, lowestPrice);
  const saveTip = savingsMessage(savings, lowestPrice);

  let status = 'no_results';
  if (safeExact.length > 0) status = errors.length > 0 ? 'partial_results' : 'complete';
  else if ((searched.offers?.length ?? 0) === 0 && errors.length > 0) status = 'provider_unavailable';

  return {
    statusCode: 200,
    body: {
      status,
      identifiedProduct: product,
      currentPagePrice,
      lowestPrice,
      savings,
      priceComparison: comparison,
      savingsTips: safeExact.length > 0
        ? [saveTip, 'Compare delivered totals, condition, seller terms, and return policy before buying.'].filter(Boolean)
        : ['No safe exact match was found. Try a product page with a clearer model or identifier.'],
      providerErrors: errors
    }
  };
}

function setCors(res, origin) {
  const allowed = typeof origin === 'string' && (origin.startsWith('chrome-extension://') || origin.startsWith('moz-extension://') || origin.startsWith('https://'));
  if (allowed) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
}

export default async function handler(req, res) {
  setCors(res, req.headers?.origin);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ status: 'error' });

  let payload = req.body;
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload); } catch { return res.status(400).json({ status: 'error' }); }
  }

  const catalog = await configuredCatalog();
  let visualProvider = null;
  const serpApiKey = String(process.env.SERPAPI_API_KEY ?? '').trim();
  if (serpApiKey) {
    try { visualProvider = createSerpApiLensProvider({ apiKey: serpApiKey }); } catch {}
  }
  if (!visualProvider && String(process.env.OPENAI_API_KEY ?? '').trim()) {
    try { visualProvider = createOpenAiVisionProvider({ apiKey: process.env.OPENAI_API_KEY, model: process.env.AUCTION_VISION_MODEL || 'gpt-5.6-luna' }); } catch {}
  }
  const result = await handleProductScan(payload, { providers: configuredProviders(), catalog, visualProvider });
  return res.status(result.statusCode).json(result.body);
}
