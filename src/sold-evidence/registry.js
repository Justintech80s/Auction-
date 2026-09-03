import { assertSoldEvidenceProvider } from './provider-contract.js';

function normalizeProviderName(name) {
  const normalized = String(name || '').trim();
  if (!normalized) throw new Error('Sold evidence provider name is required');
  return normalized;
}

export function createSoldEvidenceRegistry(initialProviders = {}) {
  const providers = new Map();

  function register(name, provider) {
    const providerName = normalizeProviderName(name);
    assertSoldEvidenceProvider(provider);
    providers.set(providerName, provider);
    return provider;
  }

  function get(name) {
    const providerName = normalizeProviderName(name);
    const provider = providers.get(providerName);
    if (!provider) throw new Error(`Unknown sold evidence provider: ${providerName}`);
    return provider;
  }

  function list() {
    return [...providers.keys()].sort();
  }

  for (const [name, provider] of Object.entries(initialProviders || {})) {
    register(name, provider);
  }

  return { register, get, list };
}
