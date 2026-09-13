export function assertSoldEvidenceProvider(provider) {
  if (!provider || typeof provider !== 'object') {
    throw new Error('Sold evidence provider must be an object');
  }

  if (typeof provider.searchSoldEvidence !== 'function') {
    throw new Error('Sold evidence provider requires searchSoldEvidence(query, options)');
  }

  return provider;
}
