export function createProviderRegistry(initialProviders = {}) {
  const providers = new Map(Object.entries(initialProviders));
  return {
    register(name, provider) {
      if (!name || typeof provider !== 'function') throw new Error('invalid_ai_provider');
      providers.set(String(name), provider);
    },
    get(name) {
      const provider = providers.get(String(name));
      if (typeof provider !== 'function') throw new Error('ai_provider_unavailable');
      return provider;
    },
    list() {
      return [...providers.keys()];
    }
  };
}
