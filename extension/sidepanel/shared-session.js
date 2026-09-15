const SCAN_SESSION_REQUEST = 'AUCTION_SCAN_SESSION_REQUEST';
const SCAN_SESSION_STATE = 'AUCTION_SCAN_SESSION_STATE';
const SHARED_SCAN_RESULT = 'AUCTION_SHARED_SCAN_RESULT';

const STATE_COPY = Object.freeze({
  scanning: ['Scanning product page', 'Auction is capturing bounded product evidence from this page.'],
  identifying: ['Identifying product', 'Auction is identifying the product and checking its model and features.'],
  searching_stores: ['Searching stores', 'Auction identified the product and is checking matching prices.'],
  needs_confirmation: ['Needs confirmation', 'Auction needs stronger product evidence before labeling prices as exact matches.'],
  complete: ['Prices found', 'Auction found matching store prices.'],
  partial_results: ['Prices found', 'Auction found prices, but one or more sources were unavailable.'],
  no_results: ['No matching prices found', 'Auction could not find a safe matching offer for this product.'],
  provider_unavailable: ['Price search unavailable', 'Auction could not reach the shared price-search service. Try the scan again later.'],
  error: ['Scan unavailable', 'Auction could not complete this product scan safely.']
});

function element(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const target = element(id);
  if (target) target.textContent = String(value ?? '—');
}

function setHidden(id, hidden) {
  const target = element(id);
  if (target) target.hidden = Boolean(hidden);
}

function money(value, currency = 'USD') {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: String(currency || 'USD').toUpperCase(),
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(number);
  } catch {
    return '—';
  }
}

function safeHttpsUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

function showState(state) {
  const copy = STATE_COPY[state];
  if (!copy) return;
  setText('panel-title', copy[0]);
  setText('panel-message', copy[1]);
  setText('panel-state', state);
}

function clearChildren(id) {
  const target = element(id);
  target?.replaceChildren?.();
}

function renderFeatures(features = []) {
  const container = element('shared-product-features');
  if (!container) return;
  container.replaceChildren();
  for (const feature of Array.isArray(features) ? features.slice(0, 16) : []) {
    const chip = document.createElement('span');
    chip.className = 'feature-chip';
    chip.textContent = String(feature);
    container.appendChild(chip);
  }
}

function renderIdentifiedProduct(product) {
  if (!product) return;
  setText('shared-product-heading', product.title || 'Product identified');
  const metadata = [product.brand, product.model]
    .map(value => String(value || '').trim())
    .filter(Boolean)
    .join(' · ');
  setText('shared-product-meta', metadata || 'Identity confirmed');
  renderFeatures(product.features);

  const image = element('shared-product-image');
  const imageUrl = safeHttpsUrl(product.imageUrl);
  if (image && imageUrl) {
    image.src = imageUrl;
    image.alt = product.title ? `${product.title} product image` : 'Product image';
    image.hidden = false;
  } else if (image) {
    image.removeAttribute('src');
    image.hidden = true;
  }
}

function renderLowestPrice(lowestPrice) {
  const visible = Boolean(lowestPrice && safeHttpsUrl(lowestPrice.url));
  setHidden('shared-lowest-price-card', !visible);
  if (!visible) return;

  setText('shared-lowest-price', money(lowestPrice.amount, lowestPrice.currency));
  setText('shared-lowest-store', lowestPrice.store || 'Store');
  const shipping = lowestPrice.shipping == null
    ? 'Shipping unknown'
    : `Shipping ${money(lowestPrice.shipping, lowestPrice.currency)}`;
  const total = lowestPrice.estimatedTotal == null
    ? 'Delivered total unavailable'
    : `Estimated total ${money(lowestPrice.estimatedTotal, lowestPrice.currency)}`;
  setText('shared-lowest-details', `${lowestPrice.condition || 'Condition unknown'} · ${shipping} · ${total}`);

  const link = element('shared-lowest-link');
  if (link) {
    link.href = safeHttpsUrl(lowestPrice.url);
    link.hidden = false;
  }
}

function createComparisonCard(offer) {
  const card = document.createElement('article');
  card.className = 'offer-card shared-offer-card';

  const heading = document.createElement('div');
  heading.className = 'offer-heading-row';
  const store = document.createElement('strong');
  store.textContent = offer.store || 'Store';
  const price = document.createElement('strong');
  price.textContent = money(offer.price, offer.currency);
  heading.append(store, price);

  const title = document.createElement('p');
  title.className = 'offer-title';
  title.textContent = offer.title || 'Matching product';

  const description = document.createElement('p');
  description.className = 'helper-text';
  const shipping = offer.shipping == null ? 'Shipping unknown' : `Shipping ${money(offer.shipping, offer.currency)}`;
  const total = offer.estimatedTotal == null ? 'Total unavailable' : `Total ${money(offer.estimatedTotal, offer.currency)}`;
  const match = offer.matchConfidence == null ? 'Match confidence unavailable' : `${Math.round(Number(offer.matchConfidence) * 100)}% match`;
  const guardian = offer.guardianDecision ? `Guardian ${offer.guardianDecision}` : 'Guardian not rated';
  description.textContent = [offer.description, offer.condition, shipping, total, match, guardian].filter(Boolean).join(' · ');

  card.append(heading, title, description);

  const url = safeHttpsUrl(offer.url);
  if (url) {
    const visit = document.createElement('a');
    visit.className = 'buy-link';
    visit.href = url;
    visit.target = '_blank';
    visit.rel = 'noopener noreferrer';
    visit.textContent = 'Visit Store';
    card.appendChild(visit);
  }
  return card;
}

function renderComparison(offers = []) {
  const container = element('shared-comparison-list');
  if (!container) return;
  container.replaceChildren();
  const safeOffers = (Array.isArray(offers) ? offers : [])
    .filter(offer => offer?.guardianDecision !== 'reject')
    .filter(offer => safeHttpsUrl(offer?.url))
    .slice(0, 60);
  for (const offer of safeOffers) container.appendChild(createComparisonCard(offer));
  setText('shared-comparison-count', `${safeOffers.length} offer${safeOffers.length === 1 ? '' : 's'}`);
}

function renderSavingsTips(tips = []) {
  const container = element('shared-savings-tips');
  if (!container) return;
  container.replaceChildren();
  const bounded = Array.isArray(tips) ? tips.slice(0, 12) : [];
  for (const tip of bounded) {
    const item = document.createElement('li');
    item.textContent = String(tip);
    container.appendChild(item);
  }
  setHidden('shared-savings-card', bounded.length === 0);
}

export function renderSharedResult(result) {
  if (!result || typeof result !== 'object') return;
  showState(result.status);
  setHidden('shared-scan-results', false);
  setHidden('cross-store-search', true);
  renderIdentifiedProduct(result.identifiedProduct);
  renderLowestPrice(result.lowestPrice);
  renderComparison(result.priceComparison);
  renderSavingsTips(result.savingsTips);
}

function renderLegacySession(session) {
  const legacy = session?.result?.legacySearch;
  if (!legacy || !session.identifiedProduct) return false;
  const offers = Array.isArray(legacy.offers) ? legacy.offers : [];
  const allowed = offers.filter(offer => offer.guardianDecision !== 'reject');
  const cheapest = allowed
    .filter(offer => Number.isFinite(Number(offer.itemPrice)))
    .sort((a, b) => Number(a.itemPrice) - Number(b.itemPrice))[0] ?? null;
  renderSharedResult({
    status: session.state === 'no_results' ? 'no_results' : session.state,
    identifiedProduct: session.identifiedProduct,
    lowestPrice: cheapest ? {
      amount: cheapest.itemPrice,
      currency: cheapest.currency,
      store: cheapest.store,
      url: cheapest.url,
      shipping: cheapest.shipping,
      estimatedTotal: cheapest.estimatedTotal,
      condition: cheapest.condition
    } : null,
    priceComparison: allowed.map(offer => ({
      store: offer.store,
      title: offer.title,
      price: offer.itemPrice,
      currency: offer.currency,
      shipping: offer.shipping,
      estimatedTotal: offer.estimatedTotal,
      condition: offer.condition,
      description: offer.matchClassification === 'exact' ? 'Exact match' : 'Similar match',
      url: offer.url,
      imageUrl: offer.imageUrl,
      matchConfidence: offer.matchScore,
      guardianDecision: offer.guardianDecision
    })),
    savingsTips: [],
    providerErrors: legacy.providerErrors ?? []
  });
  return true;
}

export function renderScanSession(session) {
  if (!session || typeof session !== 'object') return;
  showState(session.state);
  if (session.result && !session.result.legacySearch) {
    renderSharedResult(session.result);
    return;
  }
  if (renderLegacySession(session)) return;
  if (session.identifiedProduct) renderIdentifiedProduct(session.identifiedProduct);
}

function onRuntimeMessage(message) {
  if (message?.type === SCAN_SESSION_STATE) {
    renderScanSession(message.payload);
    return;
  }
  if (message?.type === SHARED_SCAN_RESULT) {
    renderSharedResult(message.payload);
  }
}

async function hydrate() {
  const runtime = globalThis.chrome?.runtime;
  if (!runtime?.sendMessage) return;
  try {
    const response = await runtime.sendMessage({ type: SCAN_SESSION_REQUEST });
    if (response?.type === SCAN_SESSION_STATE && response.payload) {
      renderScanSession(response.payload);
    }
  } catch {
    // The core panel remains usable if hydration is unavailable.
  }
}

if (typeof document !== 'undefined' && globalThis.chrome?.runtime) {
  globalThis.chrome.runtime.onMessage?.addListener?.(onRuntimeMessage);
  document.addEventListener('DOMContentLoaded', () => {
    clearChildren('shared-comparison-list');
    void hydrate();
  }, { once: true });
}
