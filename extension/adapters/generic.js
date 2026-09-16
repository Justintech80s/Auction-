import { normalizeDetectedProduct } from './contract.js';

function attributeValue(documentLike, selector, attribute = 'content') {
  const element = documentLike?.querySelector?.(selector);
  if (!element) return null;
  const value = element.getAttribute?.(attribute);
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function elementText(documentLike, selector) {
  const text = documentLike?.querySelector?.(selector)?.textContent;
  return typeof text === 'string' && text.trim() ? text.trim().replace(/\s+/g, ' ') : null;
}

export function explicitValue(documentLike, selector) {
  const element = documentLike?.querySelector?.(selector);
  if (!element) return null;
  for (const attribute of ['content', 'value', 'data-price']) {
    const value = element.getAttribute?.(attribute);
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  const text = typeof element.textContent === 'string' ? element.textContent.trim() : '';
  return text || null;
}

export function parseExplicitPrice(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null;
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/[$,]/g, '');
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const price = Number(normalized);
  return Number.isFinite(price) && price > 0 ? price : null;
}

function typeIncludesProduct(type) {
  if (Array.isArray(type)) return type.some(typeIncludesProduct);
  return typeof type === 'string' && type.toLowerCase() === 'product';
}

function flattenJsonLd(value) {
  if (Array.isArray(value)) return value.flatMap(flattenJsonLd);
  if (!value || typeof value !== 'object') return [];
  const children = Array.isArray(value['@graph']) ? flattenJsonLd(value['@graph']) : [];
  return [value, ...children];
}

export function findProductJsonLd(documentLike) {
  const scripts = documentLike?.querySelectorAll?.('script[type="application/ld+json"]') ?? [];
  for (const script of scripts) {
    if (typeof script?.textContent !== 'string' || !script.textContent.trim()) continue;
    try {
      const parsed = JSON.parse(script.textContent);
      const product = flattenJsonLd(parsed).find((entry) => typeIncludesProduct(entry['@type']));
      if (product) return product;
    } catch {
      // Malformed page-controlled JSON-LD is ignored.
    }
  }
  return null;
}

function firstOffer(offers) {
  if (Array.isArray(offers)) return offers.find((offer) => offer && typeof offer === 'object') ?? null;
  return offers && typeof offers === 'object' ? offers : null;
}

function brandName(brand) {
  if (typeof brand === 'string') return brand;
  if (brand && typeof brand === 'object' && typeof brand.name === 'string') return brand.name;
  return null;
}

function compactIdentifiers(product) {
  const identifiers = {};
  for (const key of ['sku', 'mpn', 'gtin', 'gtin8', 'gtin12', 'gtin13', 'gtin14']) {
    const value = product?.[key];
    if (typeof value === 'string' || typeof value === 'number') identifiers[key] = String(value);
  }
  return identifiers;
}

function conditionName(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const tail = value.trim().split(/[\/#]/).filter(Boolean).pop();
  return tail || value.trim();
}

export function normalizeStructuredProduct(product, context, source = 'generic') {
  if (!product || typeof product !== 'object') return null;
  const offer = firstOffer(product.offers);
  const title = typeof product.name === 'string' ? product.name : null;
  const price = parseExplicitPrice(offer?.price ?? product.price);
  const currency = typeof (offer?.priceCurrency ?? product.priceCurrency) === 'string'
    ? (offer?.priceCurrency ?? product.priceCurrency)
    : null;

  if (!title || !price || !currency) return null;

  return normalizeDetectedProduct({
    source,
    url: context.url,
    title,
    price,
    currency,
    condition: conditionName(offer?.itemCondition ?? product.itemCondition),
    brand: brandName(product.brand),
    model: typeof product.model === 'string' ? product.model : null,
    category: typeof product.category === 'string' ? product.category : null,
    identifiers: compactIdentifiers(product)
  }, context);
}

function hasOpenGraphProductEvidence(documentLike) {
  const title = attributeValue(documentLike, 'meta[property="og:title"]');
  const price = parseExplicitPrice(attributeValue(documentLike, 'meta[property="product:price:amount"]'));
  const currency = attributeValue(documentLike, 'meta[property="product:price:currency"]');
  return Boolean(title && price && currency);
}

function extractOpenGraph(documentLike, context) {
  const title = attributeValue(documentLike, 'meta[property="og:title"]');
  const price = parseExplicitPrice(attributeValue(documentLike, 'meta[property="product:price:amount"]'));
  const currency = attributeValue(documentLike, 'meta[property="product:price:currency"]');
  if (!title || !price || !currency) return null;

  return normalizeDetectedProduct({
    source: 'generic',
    url: context.url,
    title,
    price,
    currency
  }, context);
}

export const genericAdapter = Object.freeze({
  name: 'generic',
  matches(_url, documentLike) {
    return Boolean(findProductJsonLd(documentLike))
      || attributeValue(documentLike, 'meta[property="og:type"]')?.toLowerCase() === 'product'
      || hasOpenGraphProductEvidence(documentLike);
  },
  extract(documentLike, context = {}) {
    const structured = findProductJsonLd(documentLike);
    if (structured) {
      const product = normalizeStructuredProduct(structured, context, 'generic');
      if (product) return product;
    }
    return extractOpenGraph(documentLike, context);
  }
});