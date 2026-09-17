export function collectActiveProductEvidence(options = {}) {
  const documentLike = options.documentLike ?? globalThis.document;
  const locationLike = options.locationLike ?? globalThis.location;
  const now = options.now ?? new Date();

  function cleanText(value, max = 512) {
    if (value == null) return null;
    let text = String(value).trim().replace(/\s+/g, ' ');
    if (!text) return null;
    text = text.replace(/\b(?:\d[ -]*?){13,19}\b/g, '[redacted]');
    return text.slice(0, max) || null;
  }
  function httpsUrl(value) { if (typeof value !== 'string' || !value.trim()) return null; try { const url = new URL(value.trim(), locationLike?.href); if (url.protocol !== 'https:') return null; url.hash = ''; return url.toString(); } catch { return null; } }
  function attr(selector, attribute = 'content') { const element = documentLike?.querySelector?.(selector); return cleanText(element?.getAttribute?.(attribute), attribute === 'content' ? 2048 : 512); }
  function text(selector) { return cleanText(documentLike?.querySelector?.(selector)?.textContent, 256); }
  function parsePrice(value) { if (value == null) return null; const match = String(value).replace(/,/g, '').match(/(?:\$|USD\s*)?([0-9]+(?:\.[0-9]{1,2})?)/i); const number = match ? Number(match[1]) : NaN; return Number.isFinite(number) && number > 0 ? number : null; }
  function normalizeCurrency(value, priceText = '') { const code = cleanText(value, 16)?.toUpperCase(); if (code && /^[A-Z]{3}$/.test(code)) return code; return /\$|\bUSD\b/i.test(priceText) ? 'USD' : null; }
  function typeIncludesProduct(type) { if (Array.isArray(type)) return type.some(typeIncludesProduct); return typeof type === 'string' && type.toLowerCase() === 'product'; }
  function flattenJsonLd(value) { if (Array.isArray(value)) return value.flatMap(flattenJsonLd); if (!value || typeof value !== 'object') return []; const graph = Array.isArray(value['@graph']) ? flattenJsonLd(value['@graph']) : []; return [value, ...graph]; }
  function firstProductJsonLd() { const scripts = documentLike?.querySelectorAll?.('script[type="application/ld+json"]') ?? []; for (const script of scripts) { if (typeof script?.textContent !== 'string' || !script.textContent.trim()) continue; try { const parsed = JSON.parse(script.textContent); const product = flattenJsonLd(parsed).find(entry => typeIncludesProduct(entry?.['@type'])); if (product) return product; } catch {} } return null; }
  function brandName(value) { if (typeof value === 'string') return cleanText(value, 128); if (value && typeof value === 'object') return cleanText(value.name, 128); return null; }
  function conditionName(value) { const valueText = cleanText(value, 128); if (!valueText) return null; const tail = valueText.split(/[\/#]/).filter(Boolean).pop(); return cleanText(tail || valueText, 128); }
  function firstImage(value) { if (Array.isArray(value)) return value.map(firstImage).find(Boolean) ?? null; if (value && typeof value === 'object') return httpsUrl(value.url || value.contentUrl); return httpsUrl(value); }
  function addRecord(target, key, value, maxEntries) { if (Object.keys(target).length >= maxEntries) return; const cleanKey = cleanText(key, 64); const cleanValue = cleanText(value, 256); if (cleanKey && cleanValue) target[cleanKey] = cleanValue; }

  const sourceUrl = httpsUrl(locationLike?.href);
  if (!sourceUrl) return { sourceUrl: null, pageTitle: null, title: null, brand: null, model: null, category: null, condition: null, identifiers: {}, specs: {}, imageUrl: null, observedPrice: null, observedCurrency: null, evidenceKinds: [], confidence: 0, capturedAt: new Date(now).toISOString() };

  const evidenceKinds = []; const identifiers = {}; const specs = {};
  let title = null, brand = null, model = null, category = null, condition = null, imageUrl = null, observedPrice = null, observedCurrency = null, confidence = 0;
  const structured = firstProductJsonLd();
  if (structured) {
    evidenceKinds.push('structured_product'); confidence = Math.max(confidence, 0.70);
    title = cleanText(structured.name, 512); brand = brandName(structured.brand); model = cleanText(structured.model, 128); category = cleanText(structured.category, 256); condition = conditionName(structured.itemCondition); imageUrl = firstImage(structured.image);
    const offers = Array.isArray(structured.offers) ? structured.offers[0] : structured.offers;
    observedPrice = parsePrice(offers?.price ?? offers?.lowPrice);
    observedCurrency = normalizeCurrency(offers?.priceCurrency, String(offers?.price ?? ''));
    for (const key of ['sku','mpn','gtin','gtin8','gtin12','gtin13','gtin14']) addRecord(identifiers, key, structured[key], 20);
  }

  const metaTitle = attr('meta[property="og:title"]') || attr('meta[name="twitter:title"]');
  if (!title && metaTitle) title = cleanText(metaTitle, 512);
  if (metaTitle && !evidenceKinds.includes('page_metadata')) evidenceKinds.push('page_metadata');
  const metaImage = attr('meta[property="og:image"]') || attr('meta[name="twitter:image"]'); if (!imageUrl && metaImage) imageUrl = httpsUrl(metaImage);
  const metaModel = attr('meta[itemprop="model"]'); if (!model && metaModel) model = cleanText(metaModel, 128);
  for (const [selector,key] of [['meta[itemprop="sku"]','sku'],['meta[itemprop="mpn"]','mpn'],['meta[itemprop="gtin"]','gtin']]) { const value = attr(selector); if (value) addRecord(identifiers, key, value, 20); }

  if (observedPrice == null) {
    const priceRaw = attr('meta[property="product:price:amount"]') || attr('[itemprop="price"]') || text('[itemprop="price"]');
    observedPrice = parsePrice(priceRaw);
    observedCurrency = normalizeCurrency(attr('meta[property="product:price:currency"]') || attr('[itemprop="priceCurrency"]'), priceRaw || '');
    if (observedPrice != null && !evidenceKinds.includes('page_price')) evidenceKinds.push('page_price');
  }

  const pageTitle = cleanText(documentLike?.title, 512); if (!title && pageTitle) title = pageTitle;
  if ((metaTitle || pageTitle) && confidence === 0) confidence = 0.35;
  if ((metaTitle || pageTitle) && !evidenceKinds.includes('page_metadata')) evidenceKinds.push('page_metadata');
  if (model || Object.keys(identifiers).length > 0) { confidence = Math.min(1, confidence + 0.20); if (!evidenceKinds.includes('strong_identifiers')) evidenceKinds.push('strong_identifiers'); }
  if (imageUrl) { confidence = Math.min(1, confidence + 0.10); if (!evidenceKinds.includes('primary_image')) evidenceKinds.push('primary_image'); }
  if (observedPrice != null) confidence = Math.min(1, confidence + 0.10);

  return { sourceUrl, pageTitle, title, brand, model, category, condition, identifiers, specs, imageUrl, observedPrice, observedCurrency, evidenceKinds, confidence: Math.round(confidence * 100) / 100, capturedAt: new Date(now).toISOString() };
}
