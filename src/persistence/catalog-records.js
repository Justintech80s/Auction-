function boundedText(value, maxLength = 512) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function safeHttpsUrl(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

function positiveNumber(value) {
  return Number.isFinite(value) && value > 0 ? value : null;
}

function nonNegativeNumberOrNull(value) {
  if (value == null) return null;
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function safeJsonObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result = {};
  for (const [key, rawValue] of Object.entries(value)) {
    const safeKey = boundedText(key, 80);
    if (!safeKey) continue;
    if (typeof rawValue === 'string') {
      const safeValue = boundedText(rawValue, 512);
      if (safeValue) result[safeKey] = safeValue;
    } else if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
      result[safeKey] = rawValue;
    } else if (typeof rawValue === 'boolean') {
      result[safeKey] = rawValue;
    }
    if (Object.keys(result).length >= 40) break;
  }
  return result;
}

export function toCatalogRecords({ evidence = {}, identifiedProduct = {}, offer = {} } = {}) {
  if (offer.guardianDecision !== 'allow') return null;
  if (offer.matchClassification !== 'exact') return null;

  const purchaseUrl = safeHttpsUrl(offer.url);
  const itemPrice = positiveNumber(offer.itemPrice);
  if (!purchaseUrl || itemPrice == null) return null;

  const shippingPrice = nonNegativeNumberOrNull(offer.shipping);
  if (offer.shipping != null && shippingPrice == null) return null;

  const currency = (boundedText(offer.currency, 3) || 'USD').toUpperCase();
  if (currency !== 'USD') return null;

  const name = boundedText(
    identifiedProduct.name || identifiedProduct.title || evidence.title,
    512
  );
  const storeName = boundedText(offer.store, 160);
  if (!name || !storeName) return null;

  const productImageUrl = safeHttpsUrl(evidence.imageUrl)?.toString() ?? null;
  const offerImageUrl = safeHttpsUrl(offer.imageUrl)?.toString() ?? null;
  const imageUrls = [...new Set([offerImageUrl, productImageUrl].filter(Boolean))].slice(0, 8);

  return {
    product: {
      name,
      brand: boundedText(identifiedProduct.brand || evidence.brand, 160),
      model: boundedText(identifiedProduct.model || evidence.model, 240),
      barcode: boundedText(identifiedProduct.barcode || evidence.barcode, 128),
      specifications: safeJsonObject(identifiedProduct.specifications || evidence.specifications),
      imageUrls
    },
    store: {
      name: storeName,
      websiteUrl: purchaseUrl.origin
    },
    offer: {
      provider: boundedText(offer.source, 80) || 'unknown',
      providerOfferId: boundedText(offer.sourceId, 240),
      itemPrice,
      shippingPrice,
      currency,
      condition: boundedText(offer.condition, 80),
      availability: boundedText(offer.availability, 80),
      purchaseUrl: purchaseUrl.toString(),
      imageUrl: offerImageUrl,
      guardianDecision: 'allow',
      matchClassification: 'exact'
    },
    history: {
      itemPrice,
      shippingPrice,
      currency
    }
  };
}
