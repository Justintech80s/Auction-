import { createPostgresCatalogFromEnv } from '../src/persistence/postgres-runtime.js';

let catalogPromise = null;

function cleanText(value, max = 512) {
  if (value == null) return null;
  const text = String(value).trim().replace(/\s+/g, ' ');
  return text ? text.slice(0, max) : null;
}

function httpsUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    url.hash = '';
    return url.toString();
  } catch { return null; }
}

function identifiers(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).slice(0, 20).map(([key, entry]) => [
    cleanText(key, 64), cleanText(entry, 256)
  ]).filter(([key, entry]) => key && entry));
}

function normalizeObservation(input = {}) {
  const price = Number(input.observedPrice ?? input.price);
  const currency = cleanText(input.observedCurrency ?? input.currency ?? 'USD', 3)?.toUpperCase();
  const sourceUrl = httpsUrl(input.sourceUrl ?? input.url);
  const title = cleanText(input.title ?? input.pageTitle);
  if (!sourceUrl || !title || !Number.isFinite(price) || price <= 0 || currency !== 'USD') return null;
  const captured = new Date(input.capturedAt ?? Date.now());
  return {
    sourceUrl, title, price: Math.round(price * 100) / 100, currency,
    brand: cleanText(input.brand, 128), model: cleanText(input.model, 128),
    condition: cleanText(input.condition, 64), identifiers: identifiers(input.identifiers),
    capturedAt: Number.isFinite(captured.getTime()) ? captured.toISOString() : new Date().toISOString()
  };
}

async function configuredCatalog() {
  if (!String(process.env.AUCTION_DATABASE_URL ?? '').trim()) return null;
  if (!catalogPromise) catalogPromise = createPostgresCatalogFromEnv({ env: process.env }).catch(() => null);
  return catalogPromise;
}

function setCors(res, origin) {
  const allowed = typeof origin === 'string' && (
    origin.startsWith('chrome-extension://') || origin.startsWith('moz-extension://') ||
    origin === 'https://auction-jays-list.vercel.app' || origin === 'https://auction-ebon-eta.vercel.app'
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
    try { payload = JSON.parse(payload); } catch { return res.status(400).json({ status: 'error' }); }
  }
  if (payload?.action !== 'observe_price') return res.status(400).json({ status: 'error' });
  const observation = normalizeObservation(payload.evidence);
  if (!observation) return res.status(200).json({ status: 'ignored' });

  const catalog = await configuredCatalog();
  if (!catalog?.persistPageObservation) return res.status(200).json({ status: 'storage_unavailable' });
  try {
    const stored = await catalog.persistPageObservation(observation);
    const history = await catalog.getPriceHistory({ productId: stored.productId, days: 90 });
    const prices = history.map(row => Number(row.price)).filter(Number.isFinite);
    return res.status(200).json({
      status: 'recorded',
      history: {
        observations: prices.length,
        low: prices.length ? Math.min(...prices) : observation.price,
        high: prices.length ? Math.max(...prices) : observation.price,
        average: prices.length ? Math.round((prices.reduce((sum, p) => sum + p, 0) / prices.length) * 100) / 100 : observation.price,
        points: history.slice(-180)
      }
    });
  } catch {
    return res.status(200).json({ status: 'storage_unavailable' });
  }
}
