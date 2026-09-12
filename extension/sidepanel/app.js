import { buildAnalysisViewModel } from './view-model.js';
import { MESSAGE_TYPES, createExtensionMessage } from '../messaging/messages.js';

const PANEL_COPY = Object.freeze({
  idle: Object.freeze({ title: 'Ready to analyze', message: 'Open a supported product page to begin.' }),
  scanning: Object.freeze({ title: 'Scanning product page', message: 'Auction is reading the product details on this page.' }),
  analyzing: Object.freeze({ title: 'Analyzing deal', message: 'Auction is checking valuation, evidence, and Guardian risk.' }),
  unsupported: Object.freeze({ title: 'Product not supported', message: 'Auction could not identify a supported product on this page.' }),
  error: Object.freeze({ title: 'Analysis unavailable', message: 'Auction could not complete this analysis safely.' })
});

export function formatMoney(value, currency = 'USD') {
  if (value === null || value === undefined || value === '') return '—';
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) return '—';
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: String(currency || 'USD').toUpperCase(),
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(normalized);
  } catch {
    return '—';
  }
}

export function formatPercent(value) {
  if (value === null || value === undefined || value === '') return '—';
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) return '—';
  return `${Math.round(Math.max(0, Math.min(1, normalized)) * 100)}%`;
}

function formatRange(range, currency) {
  if (!range) return '—';
  const low = formatMoney(range.low, currency);
  const high = formatMoney(range.high, currency);
  return low === '—' || high === '—' ? '—' : `${low} – ${high}`;
}

export function buildPanelState(state, viewModel = {}) {
  if (state === 'result') {
    const currency = viewModel.currency || 'USD';
    return Object.freeze({
      state,
      title: 'Auction analysis',
      message: viewModel.decisionReason || 'Auction analysis is ready.',
      productTitle: viewModel.productTitle || 'Unknown product',
      currentPrice: formatMoney(viewModel.currentPrice, currency),
      estimatedValue: formatMoney(viewModel.estimatedValue, currency),
      valueRange: formatRange(viewModel.valueRange, currency),
      verifiedSoldCount: String(Number.isFinite(Number(viewModel.verifiedSoldCount)) ? Number(viewModel.verifiedSoldCount) : 0),
      potentialProfit: formatMoney(viewModel.potentialProfit, currency),
      confidence: formatPercent(viewModel.confidence),
      decision: viewModel.decision || 'manual_review',
      riskState: viewModel.riskState || 'unknown',
      soldEvidenceState: viewModel.soldEvidenceState || 'not_configured'
    });
  }

  const copy = PANEL_COPY[state] || PANEL_COPY.error;
  return Object.freeze({ state: PANEL_COPY[state] ? state : 'error', ...copy });
}

function setText(documentLike, id, value) {
  const element = documentLike?.getElementById?.(id);
  if (element) element.textContent = String(value ?? '—');
}

function setHidden(documentLike, id, hidden) {
  const element = documentLike?.getElementById?.(id);
  if (element) element.hidden = Boolean(hidden);
}

export function renderPanel(documentLike, panel) {
  const resultVisible = panel.state === 'result';
  setText(documentLike, 'panel-title', panel.title);
  setText(documentLike, 'panel-message', panel.message);
  setText(documentLike, 'panel-state', panel.state);
  setHidden(documentLike, 'analysis-result', !resultVisible);
  setHidden(documentLike, 'analyze-again', !resultVisible);

  if (!resultVisible) return;

  setText(documentLike, 'product-title', panel.productTitle);
  setText(documentLike, 'current-price', panel.currentPrice);
  setText(documentLike, 'estimated-value', panel.estimatedValue);
  setText(documentLike, 'value-range', panel.valueRange);
  setText(documentLike, 'verified-sold-count', panel.verifiedSoldCount);
  setText(documentLike, 'potential-profit', panel.potentialProfit);
  setText(documentLike, 'confidence', panel.confidence);
  setText(documentLike, 'decision', panel.decision);
  setText(documentLike, 'risk-state', panel.riskState);
  setText(documentLike, 'sold-evidence-state', panel.soldEvidenceState);
}

export function createSidePanelApp({ documentLike, runtime } = {}) {
  if (!documentLike) throw new TypeError('documentLike is required');
  if (!runtime || typeof runtime.sendMessage !== 'function') throw new TypeError('runtime is required');

  let lastProduct = null;

  const show = (state, viewModel) => renderPanel(documentLike, buildPanelState(state, viewModel));

  async function analyze(product) {
    if (!product) {
      show('unsupported');
      return;
    }

    lastProduct = product;
    show('analyzing');

    try {
      const request = createExtensionMessage(MESSAGE_TYPES.ANALYSIS_REQUEST, { product });
      const response = await runtime.sendMessage(request);
      if (response?.type !== MESSAGE_TYPES.ANALYSIS_RESULT) {
        show('error');
        return;
      }
      const viewModel = buildAnalysisViewModel(response.payload.analysis, product);
      show('result', viewModel);
    } catch {
      show('error');
    }
  }

  const onMessage = (message) => {
    if (message?.type !== MESSAGE_TYPES.PRODUCT_DETECTED) return undefined;
    show('scanning');
    void analyze(message?.payload?.product);
    return undefined;
  };

  runtime.onMessage?.addListener?.(onMessage);
  documentLike.getElementById?.('analyze-again')?.addEventListener?.('click', () => void analyze(lastProduct));
  show('idle');

  return Object.freeze({
    analyze,
    render: show,
    destroy() {
      runtime.onMessage?.removeListener?.(onMessage);
    }
  });
}

if (typeof document !== 'undefined' && globalThis.chrome?.runtime) {
  document.addEventListener('DOMContentLoaded', () => {
    createSidePanelApp({ documentLike: document, runtime: globalThis.chrome.runtime });
  }, { once: true });
}
