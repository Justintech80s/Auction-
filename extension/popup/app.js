import { collectActiveProductEvidence } from '../content/active-scan.js';
import { MESSAGE_TYPES, createExtensionMessage } from '../messaging/messages.js';

function assertDependency(value, method, label) {
  if (!value || typeof value[method] !== 'function') {
    throw new TypeError(`${label}.${method} is required`);
  }
  return value;
}

function isScannableUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

export function createPopupApp({
  documentLike,
  tabs,
  scripting,
  runtime,
  sidePanel
} = {}) {
  if (!documentLike?.getElementById) throw new TypeError('documentLike is required');
  const tabsApi = assertDependency(tabs, 'query', 'tabs');
  const scriptingApi = assertDependency(scripting, 'executeScript', 'scripting');
  const runtimeApi = assertDependency(runtime, 'sendMessage', 'runtime');
  const sidePanelApi = assertDependency(sidePanel, 'open', 'sidePanel');

  const scanButton = documentLike.getElementById('scan-product');
  const sidebarButton = documentLike.getElementById('open-sidebar');
  const status = documentLike.getElementById('popup-status');
  if (!scanButton || !sidebarButton || !status) throw new TypeError('popup controls are required');

  function setStatus(message) {
    status.textContent = String(message || '');
  }

  async function activeTab() {
    const matches = await tabsApi.query({ active: true, currentWindow: true });
    const tab = Array.isArray(matches) ? matches[0] : null;
    if (!Number.isInteger(tab?.id) || tab.id <= 0) return null;
    return tab;
  }

  async function openSidebar() {
    try {
      const tab = await activeTab();
      if (!tab) {
        setStatus('Auction could not find the active tab.');
        return false;
      }
      await sidePanelApi.open({ tabId: tab.id });
      setStatus('Auction sidebar opened.');
      return true;
    } catch {
      setStatus('Auction could not open the sidebar.');
      return false;
    }
  }

  async function scanProduct() {
    scanButton.disabled = true;
    setStatus('Scanning this product…');
    try {
      const tab = await activeTab();
      if (!tab || !isScannableUrl(tab.url)) {
        setStatus('Auction cannot scan this browser page.');
        return false;
      }

      // Call sidePanel.open immediately after active-tab resolution while the click activation is current.
      const openPromise = Promise.resolve(sidePanelApi.open({ tabId: tab.id })).catch(() => undefined);
      const injections = await scriptingApi.executeScript({
        target: { tabId: tab.id },
        func: collectActiveProductEvidence
      });
      await openPromise;

      const evidence = Array.isArray(injections) ? injections[0]?.result : null;
      if (!evidence || typeof evidence !== 'object') {
        setStatus('Auction could not identify product details on this page.');
        return false;
      }

      const request = createExtensionMessage(MESSAGE_TYPES.SCAN_ACTIVE_PRODUCT_REQUEST, {
        tabId: tab.id,
        evidence
      });
      await runtimeApi.sendMessage(request);
      setStatus('Scan sent to Auction.');
      return true;
    } catch {
      setStatus('Auction could not scan this browser page.');
      return false;
    } finally {
      scanButton.disabled = false;
    }
  }

  scanButton.addEventListener('click', scanProduct);
  sidebarButton.addEventListener('click', openSidebar);

  return Object.freeze({
    scanProduct,
    openSidebar,
    destroy() {
      scanButton.removeEventListener?.('click', scanProduct);
      sidebarButton.removeEventListener?.('click', openSidebar);
    }
  });
}

if (typeof document !== 'undefined' && globalThis.chrome) {
  const start = () => createPopupApp({
    documentLike: document,
    tabs: globalThis.chrome.tabs,
    scripting: globalThis.chrome.scripting,
    runtime: globalThis.chrome.runtime,
    sidePanel: globalThis.chrome.sidePanel
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
}
