function createElement(id) {
  const listeners = new Map();
  return {
    id,
    textContent: '',
    disabled: false,
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
    async click() {
      const listener = listeners.get('click');
      if (listener) return listener({ type: 'click' });
      return undefined;
    }
  };
}

export function popupHarness({
  tabId = 42,
  url = 'https://www.google.com/search?q=dell+latitude+7420&tbm=isch',
  scriptResult = {
    sourceUrl: 'https://www.google.com/search?q=dell+latitude+7420&tbm=isch',
    pageTitle: 'Dell Latitude 7420 - Images',
    title: 'Dell Latitude 7420',
    brand: 'Dell',
    model: 'Latitude 7420',
    category: 'Laptop',
    condition: null,
    identifiers: { mpn: 'LAT7420' },
    specs: {},
    imageUrl: 'https://images.example/dell.jpg',
    evidenceKinds: ['page_metadata', 'primary_image', 'strong_identifiers'],
    confidence: 0.85,
    capturedAt: '2026-09-14T12:00:00.000Z'
  }
} = {}) {
  const elements = new Map([
    ['scan-product', createElement('scan-product')],
    ['open-sidebar', createElement('open-sidebar')],
    ['popup-status', createElement('popup-status')]
  ]);
  const sentMessages = [];
  const scriptCalls = [];
  const openedPanels = [];

  const documentLike = {
    getElementById(id) {
      return elements.get(id) ?? null;
    }
  };

  const dependencies = {
    documentLike,
    tabs: {
      async query() {
        return [{ id: tabId, url }];
      }
    },
    scripting: {
      async executeScript(options) {
        scriptCalls.push(options);
        return [{ frameId: 0, result: scriptResult }];
      }
    },
    runtime: {
      async sendMessage(message) {
        sentMessages.push(message);
        return undefined;
      }
    },
    sidePanel: {
      open(options) {
        openedPanels.push(options);
        return Promise.resolve();
      }
    }
  };

  return {
    dependencies,
    sentMessages,
    scriptCalls,
    openedPanels,
    status() {
      return elements.get('popup-status').textContent;
    },
    async click(id) {
      return elements.get(id).click();
    }
  };
}
