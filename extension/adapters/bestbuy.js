import { normalizeDetectedProduct } from './contract.js';
import { elementText, explicitValue, findProductJsonLd, normalizeStructuredProduct, parseExplicitPrice } from './generic.js';

function isBestBuyProductUrl(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return (host === 'bestbuy.com' || host.endsWith('.bestbuy.com')) && parsed.pathname.startsWith('/site/');
  } catch {
    return false;
  }
}

function content(documentLike, selector) {
  return documentLike?.querySelector?.(selector)?.getAttribute?.('content') ?? null;
}

export const bestBuyAdapter = Object.freeze({
  name: 'bestbuy',
  matches(url) {
    return isBestBuyProductUrl(url);
  },
  extract(documentLike, context = {}) {
    if (!this.matches(context.url)) return null;
    const structured = findProductJsonLd(documentLike);
    if (structured) {
      const normalized = normalizeStructuredProduct(structured, context, 'bestbuy');
      if (normalized) return normalized;
    }

    const title = elementText(documentLike, 'h1.heading-5') ?? elementText(documentLike, 'h1');
    const price = parseExplicitPrice(explicitValue(documentLike, 'meta[itemprop="price"]'));
    const currency = content(documentLike, 'meta[itemprop="priceCurrency"]');
    if (!title || !price || !currency) return null;

    return normalizeDetectedProduct({
      source: 'bestbuy',
      url: context.url,
      title,
      price,
      currency
    }, context);
  }
});
