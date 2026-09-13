import { assertMarketplaceAdapter } from './contract.js';

const adapters = new Map();

export function registerMarketplaceAdapter(name, adapter) {
  if (typeof name !== 'string' || !name.trim()) throw new TypeError('adapter name is required');
  const normalizedName = name.trim().toLowerCase();
  const validated = assertMarketplaceAdapter(adapter);

  if (validated.name.trim().toLowerCase() !== normalizedName) {
    throw new TypeError('adapter registry name must match adapter.name');
  }

  adapters.set(normalizedName, validated);
  return validated;
}

export function getMarketplaceAdapter(name) {
  if (typeof name !== 'string' || !name.trim()) return null;
  return adapters.get(name.trim().toLowerCase()) ?? null;
}

export function listMarketplaceAdapters() {
  return [...adapters.values()];
}

export function clearMarketplaceAdapters() {
  adapters.clear();
}
