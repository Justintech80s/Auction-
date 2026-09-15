const MAX_TEXT = 240;
const MAX_FEATURES = 12;

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

export async function handleProductScan(payload) {
  if (!payload || payload.action !== 'product_scan') {
    return { statusCode: 400, body: { status: 'error' } };
  }

  const evidence = normalizeEvidence(payload.evidence);
  const product = identifiedProduct(evidence);

  if (!product) {
    return {
      statusCode: 200,
      body: {
        status: 'needs_confirmation',
        identifiedProduct: null,
        lowestPrice: null,
        priceComparison: [],
        savingsTips: ['Open a clear product page with a visible title or model and scan again.'],
        providerErrors: []
      }
    };
  }

  return {
    statusCode: 200,
    body: {
      status: 'provider_unavailable',
      identifiedProduct: product,
      lowestPrice: null,
      priceComparison: [],
      savingsTips: [
        'Live store pricing is not connected yet.',
        'Compare delivered totals, condition, and return policy before buying.'
      ],
      providerErrors: [{ source: 'shopping', code: 'provider_unavailable' }]
    }
  };
}

function setCors(res, origin) {
  const allowed = typeof origin === 'string' && (
    origin.startsWith('chrome-extension://') ||
    origin.startsWith('moz-extension://') ||
    origin.startsWith('https://')
  );
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
    try {
      payload = JSON.parse(payload);
    } catch {
      return res.status(400).json({ status: 'error' });
    }
  }

  const result = await handleProductScan(payload);
  return res.status(result.statusCode).json(result.body);
}
