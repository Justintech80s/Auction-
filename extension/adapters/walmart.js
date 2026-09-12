import { findProductJsonLd, normalizeStructuredProduct } from './generic.js';

function isWalmartProductUrl(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return (host === 'walmart.com' || host.endsWith('.walmart.com')) && parsed.pathname.startsWith('/ip/');
  } catch {
    return false;
  }
}

export const walmartAdapter = Object.freeze({
  name: 'walmart',
  matches(url) {
    return isWalmartProductUrl(url);
  },
  extract(documentLike, context = {}) {
    if (!this.matches(context.url)) return null;
    const structured = findProductJsonLd(documentLike);
    return structured ? normalizeStructuredProduct(structured, context, 'walmart') : null;
  }
});
