const MONEY = /(?:US\s*)?\$\s*([0-9][0-9,]*(?:\.\d{2})?)/;
const CHECKOUT_WORDS = /\b(checkout|order summary|your order|cart|bag)\b/i;
const COUPON_WORDS = /\b(coupon|promo(?:tional)? code|discount code)\b/i;

function textOf(node) { return String(node?.textContent || '').trim().replace(/\s+/g, ' '); }
function meta(documentLike, selector) { return documentLike?.querySelector?.(selector)?.getAttribute?.('content')?.trim() || null; }
function moneyFrom(text) { const match=String(text||'').match(MONEY); if(!match) return null; const value=Number(match[1].replace(/,/g,'')); return Number.isFinite(value)&&value>0?value:null; }
function visibleText(documentLike) { return textOf(documentLike?.body).slice(0, 50000); }

export function detectCheckoutEvidence({url, documentLike, now=new Date()}={}) {
  if (!documentLike || typeof url !== 'string' || !url.startsWith('https://')) return null;
  const bodyText=visibleText(documentLike);
  const pathCheckout=/\/(checkout|cart|basket|bag|order)(?:\/|\?|$)/i.test(new URL(url).pathname);
  if (!pathCheckout && !CHECKOUT_WORDS.test(bodyText)) return null;
  const title=meta(documentLike,'meta[property="og:title"]') || textOf(documentLike.querySelector?.('h1')) || String(documentLike.title||'').trim();
  if (!title) return null;
  const explicitPrice=moneyFrom(meta(documentLike,'meta[property="product:price:amount"]'));
  const totalNodes=[...documentLike.querySelectorAll?.('[class*="total" i], [id*="total" i], [data-testid*="total" i]') || []];
  const total=explicitPrice || totalNodes.map(node=>moneyFrom(textOf(node))).filter(Boolean).pop() || moneyFrom(bodyText);
  if (!total) return null;
  const imageUrl=meta(documentLike,'meta[property="og:image"]');
  return {status:'detected', adapter:'checkout', product:{source:'checkout',url,title,price:total,currency:'USD',condition:null,seller:null,brand:null,model:null,category:null,identifiers:{},imageUrl,capturedAt:(now instanceof Date?now:new Date(now)).toISOString()}, checkout:{hasCouponField:COUPON_WORDS.test(bodyText), orderTotal:total}};
}

export function findVisibleCouponControl(documentLike) {
  const controls=[...documentLike?.querySelectorAll?.('input,button,label,a') || []];
  return controls.find(node=>COUPON_WORDS.test([node.getAttribute?.('placeholder'),node.getAttribute?.('aria-label'),textOf(node)].filter(Boolean).join(' '))) || null;
}
