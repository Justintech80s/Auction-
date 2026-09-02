import { buildSearchQuery, rankComparables } from './intelligence.js';
import { estimateValue } from './valuation.js';
import { searchMarketplace } from './connectors/index.js';

export async function valueItem(item = {}, options = {}) {
  const query = buildSearchQuery(item);
  if (!query) {
    throw new Error('valueItem requires searchable item attributes');
  }

  const source = options.source || 'ebay';
  const search = options.search || ((searchQuery) => searchMarketplace(source, searchQuery, options.connectorOptions || {}));
  const rawComparables = await search(query);
  const ranked = rankComparables(item, rawComparables);
  const comparables = ranked.filter((comparable) => comparable.similarity >= (options.minimumSimilarity ?? 0.5));
  const valuation = estimateValue(comparables);

  return {
    query,
    source,
    rawEvidenceCount: rawComparables.length,
    acceptedEvidenceCount: comparables.length,
    rejectedEvidenceCount: rawComparables.length - comparables.length,
    comparables,
    valuation
  };
}
