import {
  normalizeOffer,
  normalizeProductIdentity
} from './contracts.js';

const MAX_PROVIDER_OFFERS = 30;
const MAX_TOTAL_OFFERS = 60;

function safeProviderName(value) {
  const text = String(value ?? '').trim();
  if (!text) throw new TypeError('provider name is required');
  return text.slice(0, 64);
}

function normalizeProvider(provider) {
  if (!provider || typeof provider !== 'object' || Array.isArray(provider)) {
    throw new TypeError('provider must be an object');
  }
  if (typeof provider.searchOffers !== 'function') {
    throw new TypeError('provider searchOffers is required');
  }
  return Object.freeze({
    name: safeProviderName(provider.name),
    trustTier: provider.trustTier === 'trusted' ? 'trusted' : 'broad',
    searchOffers: provider.searchOffers.bind(provider)
  });
}

function canonicalUrl(value) {
  const url = new URL(value);
  url.hash = '';
  return url.toString();
}

async function withTimeout(promise, timeoutMs) {
  const bounded = Math.max(1, Math.min(30_000, Number(timeoutMs) || 5000));
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('provider_timeout')), bounded);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function searchProvider(provider, identity, timeoutMs) {
  const raw = await withTimeout(
    Promise.resolve().then(() => provider.searchOffers(identity, { limit: MAX_PROVIDER_OFFERS })),
    timeoutMs
  );
  if (!Array.isArray(raw)) throw new TypeError('provider offers must be an array');

  return raw.slice(0, MAX_PROVIDER_OFFERS).map((offer) => normalizeOffer({
    ...offer,
    trustTier: provider.trustTier
  }));
}

export async function searchAcrossStores(inputIdentity, {
  providers = [],
  timeoutMs = 5000
} = {}) {
  const identity = normalizeProductIdentity(inputIdentity, {
    now: inputIdentity?.capturedAt
  });

  if (!Array.isArray(providers) || providers.length === 0) {
    return Object.freeze({
      offers: Object.freeze([]),
      providerErrors: Object.freeze([
        Object.freeze({ source: 'shopping', code: 'provider_unavailable' })
      ])
    });
  }

  const prepared = providers.map((provider, index) => {
    try {
      return { ok: true, provider: normalizeProvider(provider) };
    } catch {
      const source = String(provider?.name ?? `provider-${index + 1}`).trim().slice(0, 64) || `provider-${index + 1}`;
      return { ok: false, source };
    }
  });

  const runnable = prepared.filter(entry => entry.ok).map(entry => entry.provider);
  const settled = await Promise.allSettled(
    runnable.map(provider => searchProvider(provider, identity, timeoutMs))
  );

  const providerErrors = prepared
    .filter(entry => !entry.ok)
    .map(entry => Object.freeze({ source: entry.source, code: 'provider_unavailable' }));

  const normalizedOffers = [];
  settled.forEach((result, index) => {
    const provider = runnable[index];
    if (result.status === 'fulfilled') {
      normalizedOffers.push(...result.value);
    } else {
      providerErrors.push(Object.freeze({
        source: provider.name,
        code: 'provider_unavailable'
      }));
    }
  });

  const seenIds = new Set();
  const seenUrls = new Set();
  const offers = [];
  for (const offer of normalizedOffers) {
    if (seenIds.has(offer.offerId)) continue;
    const url = canonicalUrl(offer.url);
    if (seenUrls.has(url)) continue;
    seenIds.add(offer.offerId);
    seenUrls.add(url);
    offers.push(offer);
    if (offers.length >= MAX_TOTAL_OFFERS) break;
  }

  return Object.freeze({
    offers: Object.freeze(offers),
    providerErrors: Object.freeze(providerErrors)
  });
}
