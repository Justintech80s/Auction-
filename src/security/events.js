const SECRET_KEYS = /token|secret|password|authorization|cookie|api[-_]?key/i;

function sanitize(value, key = '') {
  if (SECRET_KEYS.test(key)) return undefined;
  if (typeof value === 'string') return value.slice(0, 256);
  if (Array.isArray(value)) return value.slice(0, 50).map((entry) => sanitize(entry)).filter((entry) => entry !== undefined);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .map(([entryKey, entryValue]) => [entryKey, sanitize(entryValue, entryKey)])
        .filter(([, entryValue]) => entryValue !== undefined)
    );
  }
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  return undefined;
}

export function redactSecurityEvent(event = {}) {
  const sanitized = sanitize(event) || {};
  return {
    timestamp: event.timestamp || new Date().toISOString(),
    ...sanitized
  };
}

export function createMemoryEventStore() {
  const events = [];
  return {
    async write(event) {
      events.push(redactSecurityEvent(event));
    },
    list() {
      return events.map((event) => structuredClone(event));
    },
    clear() {
      events.length = 0;
    }
  };
}
