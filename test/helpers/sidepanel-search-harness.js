class FakeElement {
  constructor(tagName = 'div', id = '') {
    this.tagName = String(tagName).toUpperCase();
    this.id = id;
    this.textContent = '';
    this.hidden = false;
    this.disabled = false;
    this.value = '';
    this.href = '';
    this.target = '';
    this.rel = '';
    this.className = '';
    this.children = [];
    this.listeners = new Map();
    this.attributes = new Map();
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  removeEventListener(type, listener) {
    if (this.listeners.get(type) === listener) this.listeners.delete(type);
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  replaceChildren(...children) {
    this.children = [...children];
  }

  setAttribute(name, value) {
    this.attributes.set(String(name), String(value));
  }

  getAttribute(name) {
    return this.attributes.get(String(name)) ?? null;
  }

  async click() {
    const listener = this.listeners.get('click');
    if (listener) return listener({ type: 'click', currentTarget: this });
    return undefined;
  }
}

export function sidepanelSearchHarness() {
  const elements = new Map();
  const listeners = new Set();
  const sentMessages = [];

  function element(id) {
    if (!elements.has(id)) elements.set(id, new FakeElement('div', id));
    return elements.get(id);
  }

  const documentLike = {
    getElementById(id) {
      return element(id);
    },
    createElement(tagName) {
      return new FakeElement(tagName);
    }
  };

  const runtime = {
    async sendMessage(message) {
      sentMessages.push(message);
      return undefined;
    },
    onMessage: {
      addListener(listener) {
        listeners.add(listener);
      },
      removeListener(listener) {
        listeners.delete(listener);
      }
    }
  };

  return {
    documentLike,
    runtime,
    sentMessages,
    element,
    emit(message) {
      for (const listener of [...listeners]) listener(message, {}, () => {});
    }
  };
}
