import { normalizeDetectedProduct } from './contract.js';
import { elementText, explicitValue, findProductJsonLd, normalizeStructuredProduct, parseExplicitPrice } from './generic.js';

function hostnameMatches(url, suffix) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === suffix || host.endsWith(`.${suffix}`);
  } catch {
    return false;
  }
}

function content(documentLike, selector) {
  return documentLike?.querySelector?.(selector)?.getAttribute?.('content') ?? null;
}

export const ebayAdapter = Object.freeze({
  name: 'ebay',
  matches(url) {
    if (!hostnameMatches(url, 'ebay.com')) return false;
    try { return new URL(url).pathname.startsWith('/itm/'); } catch { return false; }
  },
  extract(documentLike, context = {}) {
    if (!this.matches(context.url)) return null;
    const structured = findProductJsonLd(documentLike);
    if (structured) {
      const normalized = normalizeStructuredProduct(structured, context, 'ebay');
      if (normalized) return normalized;
    }

    const title = elementText(documentLike, 'h1.x-item-title__mainTitle span') ?? elementText(documentLike, 'h1');
    const price = parseExplicitPrice(explicitValue(documentLike, '[itemprop="price"]'));
    const currency = content(documentLike, '[itemprop="priceCurrency"]');
    if (!title || !price || !currency) return null;

    return normalizeDetectedProduct({
      source: 'ebay',
      url: context.url,
      title,
      price,
      currency,
      brand: content(documentLike, '[itemprop="brand"]')
    }, context);
  }
});
