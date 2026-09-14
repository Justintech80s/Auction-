import { buildAnalysisViewModel } from './view-model.js';
import { MESSAGE_TYPES, createExtensionMessage } from '../messaging/messages.js';
import { createWatchlistStore } from '../storage/watchlist.js';
import { createCostPresetStore } from '../storage/cost-presets.js';

const PANEL_COPY = Object.freeze({
  idle: Object.freeze({ title: 'Ready to analyze', message: 'Open a supported product page to begin.' }),
  scanning: Object.freeze({ title: 'Scanning product page', message: 'Auction is reading the product details on this page.' }),
  analyzing: Object.freeze({ title: 'Analyzing deal', message: 'Auction is checking valuation, evidence, costs, and Guardian risk.' }),
  unsupported: Object.freeze({ title: 'Product not supported', message: 'Auction could not identify a supported product on this page.' }),
  error: Object.freeze({ title: 'Analysis unavailable', message: 'Auction could not complete this analysis safely.' })
});

const SEARCH_COPY = Object.freeze({
  'searching-stores': Object.freeze({ title: 'Searching stores', message: 'Auction identified the product and is checking matching prices.' }),
  'needs-confirmation': Object.freeze({ title: 'Needs confirmation', message: 'Confirm the product identity before Auction labels store results as exact matches.' }),
  'complete-results': Object.freeze({ title: 'Prices found', message: 'Auction found matching cross-store offers.' }),
  'partial-results': Object.freeze({ title: 'Prices found', message: 'Auction found offers, but one or more shopping sources are unavailable.' }),
  'no-exact-match': Object.freeze({ title: 'No exact match found', message: 'Auction did not find a safe exact match. Similar offers may still appear below.' }),
  'provider-unavailable': Object.freeze({ title: 'Price search unavailable', message: 'Auction could not reach the shopping sources safely. Try again later.' }),
  'safe-error': Object.freeze({ title: 'Scan unavailable', message: 'Auction could not complete this product scan safely.' })
});

const CONDITIONS = Object.freeze(['new', 'refurbished', 'used', 'unknown']);
const COST_INPUTS = Object.freeze([
  ['marketplaceFee', 'cost-marketplace-fee', 'marketplace fee'],
  ['shipping', 'cost-shipping', 'shipping'],
  ['tax', 'cost-tax', 'tax'],
  ['repairs', 'cost-repairs', 'repairs'],
  ['paymentProcessing', 'cost-payment-processing', 'payment processing'],
  ['holding', 'cost-holding', 'holding']
]);

export function formatMoney(value, currency = 'USD') {
  if (value === null || value === undefined || value === '') return '—';
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) return '—';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: String(currency || 'USD').toUpperCase(), minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(normalized);
  } catch { return '—'; }
}

export function formatPercent(value) {
  if (value === null || value === undefined || value === '') return '—';
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) return '—';
  return `${Math.round(Math.max(0, Math.min(1, normalized)) * 100)}%`;
}

function formatMarginPercent(value) {
  if (value === null || value === undefined || value === '') return '—';
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) return '—';
  return `${normalized.toFixed(2)}%`;
}

function formatRange(range, currency) {
  if (!range) return '—';
  const low = formatMoney(range.low, currency);
  const high = formatMoney(range.high, currency);
  return low === '—' || high === '—' ? '—' : `${low} – ${high}`;
}

export function readCostInputs(documentLike) {
  if (!documentLike?.getElementById) return undefined;
  const costs = {};
  let supplied = false;
  for (const [field, id, label] of COST_INPUTS) {
    const raw = String(documentLike.getElementById(id)?.value ?? '').trim();
    if (!raw) continue;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) throw new TypeError(`${label} must be a finite non-negative number`);
    costs[field] = value;
    supplied = true;
  }
  return supplied ? Object.freeze(costs) : undefined;
}

export function applyCostPreset(documentLike, costs = {}) {
  if (!documentLike?.getElementById) return;
  for (const [field, id] of COST_INPUTS) {
    const element = documentLike.getElementById(id);
    if (!element) continue;
    const value = costs?.[field];
    element.value = value === null || value === undefined || value === '' ? '' : String(value);
  }
}

export async function initializeDefaultCostPreset(documentLike, costPresetStore) {
  if (!costPresetStore?.getDefault) return null;
  const preset = await costPresetStore.getDefault();
  if (!preset) return null;
  applyCostPreset(documentLike, preset.costs);
  const nameInput = documentLike?.getElementById?.('cost-preset-name');
  if (nameInput) nameInput.value = preset.name;
  return preset;
}

export function buildPanelState(state, viewModel = {}) {
  if (state === 'result') {
    const currency = viewModel.currency || 'USD';
    return Object.freeze({ state, title: 'Auction analysis', message: viewModel.decisionReason || 'Auction analysis is ready.', productTitle: viewModel.productTitle || 'Unknown product', currentPrice: formatMoney(viewModel.currentPrice, currency), estimatedValue: formatMoney(viewModel.estimatedValue, currency), valueRange: formatRange(viewModel.valueRange, currency), verifiedSoldCount: String(Number.isFinite(Number(viewModel.verifiedSoldCount)) ? Number(viewModel.verifiedSoldCount) : 0), potentialProfit: formatMoney(viewModel.potentialProfit, currency), totalCosts: formatMoney(viewModel.totalCosts, currency), netProfit: formatMoney(viewModel.netProfit, currency), netMarginPct: formatMarginPercent(viewModel.netMarginPct), costsApplied: viewModel.costsApplied === true, confidence: formatPercent(viewModel.confidence), decision: viewModel.decision || 'manual_review', riskState: viewModel.riskState || 'unknown', soldEvidenceState: viewModel.soldEvidenceState || 'not_configured' });
  }
  const copy = PANEL_COPY[state] || PANEL_COPY.error;
  return Object.freeze({ state: PANEL_COPY[state] ? state : 'error', ...copy });
}

function setText(documentLike, id, value) { const element = documentLike?.getElementById?.(id); if (element) element.textContent = String(value ?? '—'); }
function setHidden(documentLike, id, hidden) { const element = documentLike?.getElementById?.(id); if (element) element.hidden = Boolean(hidden); }

export function renderPanel(documentLike, panel) {
  const resultVisible = panel.state === 'result';
  setText(documentLike, 'panel-title', panel.title); setText(documentLike, 'panel-message', panel.message); setText(documentLike, 'panel-state', panel.state);
  setHidden(documentLike, 'analysis-result', !resultVisible); setHidden(documentLike, 'analyze-again', !resultVisible); setHidden(documentLike, 'save-item', !resultVisible);
  if (!resultVisible) return;
  for (const [id, value] of [['product-title',panel.productTitle],['current-price',panel.currentPrice],['estimated-value',panel.estimatedValue],['value-range',panel.valueRange],['verified-sold-count',panel.verifiedSoldCount],['potential-profit',panel.potentialProfit],['total-costs',panel.totalCosts],['net-profit',panel.netProfit],['net-margin',panel.netMarginPct],['confidence',panel.confidence],['decision',panel.decision],['risk-state',panel.riskState],['sold-evidence-state',panel.soldEvidenceState]]) setText(documentLike,id,value);
}

function renderPresetOptions(documentLike, presets, selectedKey = '') {
  const select = documentLike?.getElementById?.('cost-preset-select');
  if (!select || typeof documentLike?.createElement !== 'function') return;
  select.replaceChildren?.();
  const empty = documentLike.createElement('option'); empty.value = ''; empty.textContent = presets.length ? 'Choose saved preset' : 'No saved presets'; select.appendChild(empty);
  for (const preset of presets) { const option = documentLike.createElement('option'); option.value = preset.key; option.textContent = preset.name; select.appendChild(option); }
  select.value = presets.some(preset => preset.key === selectedKey) ? selectedKey : '';
}

function searchStateForStatus(status) {
  if (status === 'complete') return 'complete-results';
  if (status === 'partial_results') return 'partial-results';
  if (status === 'no_exact_match') return 'no-exact-match';
  if (status === 'provider_unavailable') return 'provider-unavailable';
  return 'safe-error';
}

function showSearchState(documentLike, state, identity = null) {
  const copy = SEARCH_COPY[state] || SEARCH_COPY['safe-error'];
  setText(documentLike, 'panel-title', copy.title);
  setText(documentLike, 'panel-message', copy.message);
  setText(documentLike, 'panel-state', state in SEARCH_COPY ? state : 'safe-error');
  setHidden(documentLike, 'analysis-result', true);
  setHidden(documentLike, 'analyze-again', true);
  setHidden(documentLike, 'save-item', true);
  setHidden(documentLike, 'cross-store-search', false);
  if (identity?.title) setText(documentLike, 'search-product-title', identity.title);
}

function recommendationLabels(offer, group = {}) {
  if (offer.guardianDecision && offer.guardianDecision !== 'allow') return [];
  const labels = [];
  if (group.cheapestItemId === offer.offerId) labels.push('Cheapest item');
  if (group.cheapestTotalId === offer.offerId) labels.push('Cheapest total');
  if (group.bestExactId === offer.offerId) labels.push('Best exact match');
  return labels;
}

function matchLabel(offer) {
  if (offer.matchClassification === 'exact') return 'Exact match';
  if (offer.matchClassification === 'similar') return 'Similar, not exact';
  if (offer.matchClassification === 'rejected') return 'Not an exact match';
  return 'Match not verified';
}

function guardianLabel(offer) {
  if (offer.guardianDecision === 'review') return 'Guardian review';
  if (offer.guardianDecision === 'reject') return 'Guardian reject';
  if (offer.guardianDecision === 'allow') return 'Guardian allowed';
  return 'Guardian not rated';
}

function createOfferCard(documentLike, offer, group) {
  const card = documentLike.createElement('article');
  card.className = 'offer-card';
  const shipping = offer.shipping === null ? 'Shipping unknown' : `Shipping ${formatMoney(offer.shipping, offer.currency)}`;
  const total = offer.estimatedTotal === null ? 'Confirmed total unavailable' : `Total ${formatMoney(offer.estimatedTotal, offer.currency)}`;
  const confidence = offer.matchScore === null || offer.matchScore === undefined ? 'Match confidence unavailable' : `Match ${formatPercent(offer.matchScore)}`;
  const availability = offer.availability ? `Availability ${offer.availability.replaceAll('_', ' ')}` : 'Availability unknown';
  const badges = recommendationLabels(offer, group);
  const parts = [
    offer.store,
    offer.title,
    `Item ${formatMoney(offer.itemPrice, offer.currency)}`,
    shipping,
    total,
    matchLabel(offer),
    confidence,
    guardianLabel(offer),
    availability,
    ...badges
  ];
  card.textContent = parts.join(' · ');

  const buy = documentLike.createElement('a');
  buy.className = 'buy-link';
  buy.href = offer.url;
  buy.target = '_blank';
  buy.rel = 'noopener noreferrer';
  buy.textContent = 'Buy';
  card.appendChild(buy);
  return card;
}

export function renderSearchResults(documentLike, payload = {}) {
  const state = searchStateForStatus(payload.status);
  showSearchState(documentLike, state, payload.identity);

  const providerErrors = Array.isArray(payload.providerErrors) ? payload.providerErrors : [];
  setText(documentLike, 'search-provider-status', providerErrors.length
    ? `${providerErrors.length} source${providerErrors.length === 1 ? '' : 's'} unavailable`
    : 'All responding sources checked');

  const offers = Array.isArray(payload.offers) ? payload.offers : [];
  for (const condition of CONDITIONS) {
    const group = payload.groups?.[condition] ?? {};
    const container = documentLike.getElementById?.(`search-${condition}-offers`);
    const conditionOffers = offers.filter(offer => offer.condition === condition);
    container?.replaceChildren?.(...conditionOffers.map(offer => createOfferCard(documentLike, offer, group)));
    setText(documentLike, `search-${condition}-count`, `${conditionOffers.length} offer${conditionOffers.length === 1 ? '' : 's'}`);
    if (condition === 'unknown') setHidden(documentLike, 'search-unknown-card', conditionOffers.length === 0);
  }
}

export function createSidePanelApp({ documentLike, runtime, watchlistStore = null, costPresetStore = null } = {}) {
  if (!documentLike) throw new TypeError('documentLike is required');
  if (!runtime || typeof runtime.sendMessage !== 'function') throw new TypeError('runtime is required');
  if (watchlistStore !== null && typeof watchlistStore?.save !== 'function') throw new TypeError('watchlistStore must provide save');
  if (costPresetStore !== null && ['save','list','remove','setDefault','getDefault','clearDefault'].some(method => typeof costPresetStore?.[method] !== 'function')) throw new TypeError('costPresetStore must provide preset and default operations');

  let lastProduct = null;
  let lastAnalysis = null;
  const show = (state, viewModel) => { const panel = buildPanelState(state, viewModel); renderPanel(documentLike, panel); if (!watchlistStore) setHidden(documentLike, 'save-item', true); };

  async function refreshCostPresets(selectedKey = '') { if (!costPresetStore) return []; const presets = await costPresetStore.list(); renderPresetOptions(documentLike, presets, selectedKey); return presets; }
  async function saveCostPreset() { if (!costPresetStore) return; try { const name = documentLike.getElementById?.('cost-preset-name')?.value ?? ''; const costs = readCostInputs(documentLike); if (!costs) throw new TypeError('At least one cost is required'); const preset = await costPresetStore.save(name, costs); await refreshCostPresets(preset.key); setText(documentLike, 'cost-preset-status', 'Preset saved locally'); } catch { setText(documentLike, 'cost-preset-status', 'Preset could not be saved'); } }
  async function applySelectedCostPreset() { if (!costPresetStore) return; const key = String(documentLike.getElementById?.('cost-preset-select')?.value ?? '').trim(); if (!key) return; const preset = (await costPresetStore.list()).find(candidate => candidate.key === key); if (!preset) return; applyCostPreset(documentLike, preset.costs); const nameInput = documentLike.getElementById?.('cost-preset-name'); if (nameInput) nameInput.value = preset.name; setText(documentLike, 'cost-preset-status', 'Preset applied'); }
  async function setSelectedCostPresetDefault() { if (!costPresetStore) return; const key = String(documentLike.getElementById?.('cost-preset-select')?.value ?? '').trim(); if (!key) return; try { const preset = await costPresetStore.setDefault(key); applyCostPreset(documentLike, preset.costs); const nameInput = documentLike.getElementById?.('cost-preset-name'); if (nameInput) nameInput.value = preset.name; setText(documentLike, 'cost-preset-status', 'Default preset saved locally'); } catch { setText(documentLike, 'cost-preset-status', 'Default preset could not be saved'); } }
  async function clearDefaultCostPreset() { if (!costPresetStore) return false; try { const selectedKey = String(documentLike.getElementById?.('cost-preset-select')?.value ?? '').trim(); const cleared = await costPresetStore.clearDefault(); await refreshCostPresets(selectedKey); setText(documentLike, 'cost-preset-status', cleared ? 'Default preset cleared' : 'No default preset set'); return cleared; } catch { setText(documentLike, 'cost-preset-status', 'Default preset could not be cleared'); return false; } }
  async function deleteSelectedCostPreset() { if (!costPresetStore) return; const key = String(documentLike.getElementById?.('cost-preset-select')?.value ?? '').trim(); if (!key) return; if (await costPresetStore.remove(key)) { await refreshCostPresets(); setText(documentLike, 'cost-preset-status', 'Preset deleted'); } }
  async function initializeCostPresets() { const preset = await initializeDefaultCostPreset(documentLike, costPresetStore); await refreshCostPresets(preset?.key ?? ''); if (preset) setText(documentLike, 'cost-preset-status', `Default: ${preset.name}`); }

  const presetReady = costPresetStore ? initializeCostPresets().catch(() => undefined) : Promise.resolve();

  async function analyze(product) { if (!product) { lastProduct = null; lastAnalysis = null; show('unsupported'); return; } lastProduct = product; lastAnalysis = null; setText(documentLike, 'save-item', 'Save'); show('analyzing'); try { await presetReady; const costs = readCostInputs(documentLike); const request = createExtensionMessage(MESSAGE_TYPES.ANALYSIS_REQUEST, { product, ...(costs === undefined ? {} : { costs }) }); const response = await runtime.sendMessage(request); if (response?.type !== MESSAGE_TYPES.ANALYSIS_RESULT) { show('error'); return; } lastAnalysis = response.payload.analysis; show('result', buildAnalysisViewModel(lastAnalysis, product)); } catch { lastAnalysis = null; show('error'); } }
  async function saveCurrent() { if (!watchlistStore || !lastProduct || !lastAnalysis) return; const button = documentLike.getElementById?.('save-item'); if (button) button.disabled = true; try { await watchlistStore.save(lastProduct, lastAnalysis); setText(documentLike, 'save-item', 'Saved'); } catch { setText(documentLike, 'save-item', 'Save failed'); } finally { if (button) button.disabled = false; } }

  const onMessage = message => {
    if (message?.type === MESSAGE_TYPES.PRODUCT_DETECTED) {
      show('scanning');
      void analyze(message?.payload?.product);
      return undefined;
    }
    if (message?.type === MESSAGE_TYPES.SCAN_ACTIVE_PRODUCT_RESULT) {
      if (message?.payload?.status === 'identified') {
        showSearchState(documentLike, 'searching-stores', message.payload.identity);
      } else if (message?.payload?.status === 'needs_confirmation') {
        showSearchState(documentLike, 'needs-confirmation', message.payload.identity);
      } else {
        showSearchState(documentLike, 'safe-error', message?.payload?.identity);
      }
      return undefined;
    }
    if (message?.type === MESSAGE_TYPES.CROSS_STORE_SEARCH_RESULT) {
      renderSearchResults(documentLike, message.payload);
      return undefined;
    }
    return undefined;
  };

  runtime.onMessage?.addListener?.(onMessage);
  documentLike.getElementById?.('analyze-again')?.addEventListener?.('click', () => void analyze(lastProduct));
  if (watchlistStore) documentLike.getElementById?.('save-item')?.addEventListener?.('click', saveCurrent);
  if (costPresetStore) {
    documentLike.getElementById?.('save-cost-preset')?.addEventListener?.('click', () => void saveCostPreset());
    documentLike.getElementById?.('apply-cost-preset')?.addEventListener?.('click', () => void applySelectedCostPreset());
    documentLike.getElementById?.('delete-cost-preset')?.addEventListener?.('click', () => void deleteSelectedCostPreset());
    documentLike.getElementById?.('set-default-cost-preset')?.addEventListener?.('click', () => void setSelectedCostPresetDefault());
    documentLike.getElementById?.('clear-default-cost-preset')?.addEventListener?.('click', () => void clearDefaultCostPreset());
  }
  setHidden(documentLike, 'cross-store-search', true);
  show('idle');

  return Object.freeze({ analyze, saveCurrent, saveCostPreset, applySelectedCostPreset, setSelectedCostPresetDefault, clearDefaultCostPreset, deleteSelectedCostPreset, refreshCostPresets, initializeCostPresets, render: show, renderSearchResults: payload => renderSearchResults(documentLike, payload), destroy() { runtime.onMessage?.removeListener?.(onMessage); } });
}

if (typeof document !== 'undefined' && globalThis.chrome?.runtime) {
  document.addEventListener('DOMContentLoaded', () => {
    const storageArea = globalThis.chrome?.storage?.local;
    const watchlistStore = storageArea ? createWatchlistStore(storageArea) : null;
    const costPresetStore = storageArea ? createCostPresetStore(storageArea) : null;
    createSidePanelApp({ documentLike: document, runtime: globalThis.chrome.runtime, watchlistStore, costPresetStore });
  }, { once: true });
}
