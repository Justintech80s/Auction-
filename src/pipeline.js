import { buildSearchQuery, rankComparables } from './intelligence.js';
import { estimateValue } from './valuation.js';
import { searchMarketplace } from './connectors/index.js';
import { validateGuardianRequest } from './security/gateway.js';
import { assessRisk } from './security/risk-engine.js';
import { runSecurityBrain } from './ai/security-brain.js';

function buildProvenance(comparables = []) {
  return comparables.map((item) => ({
    evidenceId: `${item.source || ''}:${item.sourceId || ''}`,
    source: item.source || null,
    sourceId: item.sourceId || null,
    url: item.url || null,
    evidenceType: String(item.status || '').toLowerCase() === 'sold' ? 'sold' : 'asking',
    price: item.price,
    currency: item.currency || 'USD',
    similarity: item.similarity,
    inclusion: 'accepted'
  }));
}

export async function valueItem(item = {}, options = {}) {
  if (options.guardian) {
    validateGuardianRequest({
      method: 'POST',
      body: { item },
      requestId: options.requestId,
      action: 'valuation'
    });
  }

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

  const base = {
    query,
    source,
    rawEvidenceCount: rawComparables.length,
    acceptedEvidenceCount: comparables.length,
    rejectedEvidenceCount: rawComparables.length - comparables.length,
    comparables,
    valuation
  };

  if (!options.guardian) return base;

  const security = assessRisk({ item, comparables, valuation });
  const ai = await runSecurityBrain({
    provider: options.aiProvider,
    deterministicRisk: security,
    evidence: comparables,
    timeoutMs: options.aiTimeoutMs ?? 1500
  });

  return {
    ...base,
    security,
    ai,
    provenance: buildProvenance(comparables)
  };
}
