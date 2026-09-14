function node({ textContent = '', attrs = {} } = {}) {
  return {
    textContent,
    getAttribute(name) {
      return attrs[name] ?? null;
    }
  };
}

export function fakeScanDocument({ title = '', selectors = {}, jsonLd = [] } = {}) {
  const entries = new Map(
    Object.entries(selectors).map(([selector, value]) => {
      if (value && typeof value === 'object' && ('content' in value || 'value' in value || 'textContent' in value)) {
        const attrs = { ...value };
        const textContent = value.textContent ?? '';
        delete attrs.textContent;
        return [selector, node({ textContent, attrs })];
      }
      return [selector, value];
    })
  );

  return {
    title,
    querySelector(selector) {
      const value = entries.get(selector);
      return Array.isArray(value) ? value[0] ?? null : value ?? null;
    },
    querySelectorAll(selector) {
      if (selector === 'script[type="application/ld+json"]') {
        return jsonLd.map(value => node({ textContent: JSON.stringify(value) }));
      }
      const value = entries.get(selector);
      if (Array.isArray(value)) return value;
      return value ? [value] : [];
    }
  };
}
