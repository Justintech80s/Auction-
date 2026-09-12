import { normalizeDetectedProduct } from './contract.js';
import { elementText, explicitValue, findProductJsonLd, normalizeStructuredProduct, parseExplicitPrice } from './generic.js';

function isAmazonProductUrl(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (!(host === 'amazon.com' || host.endsWith('.amazon.com'))) return false;
    return /\/(?:dp|gp\/product)\//.test(parsed.pathname);
  } catch {
    return false;
  }
}

function content(documentLike, selector) {
  return documentLike?.querySelector?.(selector)?.getAttribute?.('content') ?? null;
}

function cleanBrand(value) {
  if (typeof value !== 'string') return null;
  return value
    .replace(/^Brand:\s*/i, '')
    .replace(/^Visit the\s+/i, '')
    .replace(/\s+Store$/i, '')
    .trim() || null;
}

export const amazonAdapter = Object.freeze({
  name: 'amazon',
  matches(url) {
    return isAmazonProductUrl(url);
  },
  extract(documentLike, context = {}) {
    if (!this.matches(context.url)) return null;
    const structured = findProductJsonLd(documentLike);
    if (structured) {
      const normalized = normalizeStructuredProduct(structured, context, 'amazon');
      if (normalized) return normalized;
    }

    const title = elementText(documentLike, '#productTitle');
    const price = parseExplicitPrice(explicitValue(documentLike, 'meta[itemprop="price"]'))
      ?? parseExplicitPrice(elementText(documentLike, '.a-price .a-offscreen'));
    const currency = content(documentLike, 'meta[itemprop="priceCurrency"]') ?? 'USD';
    if (!title || !price) return null;

    return normalizeDetectedProduct({
      source: 'amazon',
      url: context.url,
      title,
      price,
      currency,
      brand: cleanBrand(elementText(documentLike, '#bylineInfo'))
    }, context);
  }
});
