import { buildSearchQuery, rankComparables } from './intelligence.js';
import { estimateValue } from './valuation.js';
import { evaluateOpportunity } from './opportunity.js';
import { searchMarketplace } from './connectors/index.js';
import { validateGuardianRequest } from './security/gateway.js';
import { assessRisk } from './security/risk-engine.js';
import { assessSoldEvidenceRisk } from './security/sold-evidence-risk.js';
import { runSecurityBrain } from './ai/security-brain.js';
import { assertSoldEvidenceProvider } from './sold-evidence/provider-contract.js';
import { normalizeSoldRecord } from './sold-evidence/normalize.js';
import { mergeMarketEvidence } from './sold-evidence/merge.js';

function buildProvenance(comparables = []) {
  return comparables.map((item) => ({
    evidenceId: `${item.source || ''}:${item.sourceId || ''}`,
    source: item.source || null,
    sourceId: item.sourceId || null,
    url: item.url || null,
    evidenceType: String(item.status || '').toLowerCase() === 'sold' ? 'sold' : 'asking',
    verification: item.verification || null,
    price: item.price,
    currency: item.currency || 'USD',
    similarity: item.similarity,
    inclusion: 'accepted'
  }));
}

function labelEvidenceType(record) {
  if (record?.evidenceType) return record;
  const evidenceType = String(record?.status || '').toLowerCase() === 'sold' ? 'sold' : 'asking';
  return { ...record, evidenceType };
}

function soldProviderName(provider) {
  const name = String(provider?.name || '').trim();
  return name || 'custom';
}

function emptySoldEvidence(status, provider = null) {
  return {
    status,
    provider,
    count: 0,
    verifiedCount: 0,
    risk: null
  };
}

async function collectSoldEvidence(query, item, options, minimumSimilarity) {
  const provider = options.soldEvidenceProvider;
  if (!provider) {
    return { records: [], summary: emptySoldEvidence('not_configured') };
  }

  const providerName = soldProviderName(provider);
  const soldOptions = options.soldEvidenceOptions || {};

  try {
    assertSoldEvidenceProvider(provider);
    const rawRecords = await provider.searchSoldEvidence(query, soldOptions);
    if (!Array.isArray(rawRecords)) {
      throw new Error('Sold evidence provider must return an array');
    }

    const normalized = rawRecords.map((record) => normalizeSoldRecord(record, {
      now: soldOptions.now
    }));
    const risk = assessSoldEvidenceRisk(normalized, {
      now: soldOptions.now,
      requireFresh: options.requireFreshSoldEvidence === true,
      maxAgeDays: soldOptions.maxAgeDays
    });
    const records = rankComparables(item, risk.accepted)
      .filter((record) => record.similarity >= minimumSimilarity);
    const verifiedCount = records
      .filter((record) => record.verification === 'verified_sale')
      .length;

    return {
      records,
      summary: {
        status: 'ok',
        provider: providerName,
        count: records.length,
        verifiedCount,
        risk
      }
    };
  } catch {
    return {
      records: [],
      summary: emptySoldEvidence('unavailable', providerName)
    };
  }
}

function shouldGateOpportunityWithSoldEvidence(options) {
  return Boolean(options.soldEvidenceProvider) || options.requireFreshSoldEvidence === true;
}

function buildOpportunitySoldEvidence(options, soldEvidence, valuation) {
  if (!shouldGateOpportunityWithSoldEvidence(options)) return undefined;
  return {
    ...soldEvidence,
    quality: Number(valuation.soldEvidenceQuality || 0)
  };
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
  const minimumSimilarity = options.minimumSimilarity ?? 0.5;
  const askingComparables = rankComparables(item, rawComparables)
    .filter((comparable) => comparable.similarity >= minimumSimilarity)
    .map(labelEvidenceType);
  const sold = await collectSoldEvidence(query, item, options, minimumSimilarity);
  const comparables = mergeMarketEvidence(askingComparables, sold.records);
  const valuation = estimateValue(comparables);

  const base = {
    query,
    source,
    rawEvidenceCount: rawComparables.length,
    acceptedEvidenceCount: askingComparables.length,
    rejectedEvidenceCount: rawComparables.length - askingComparables.length,
    comparables,
    valuation,
    soldEvidence: sold.summary
  };

  const opportunitySoldEvidence = buildOpportunitySoldEvidence(options, sold.summary, valuation);

  if (!options.guardian) {
    if (options.acquisitionPrice == null) return base;
    return {
      ...base,
      opportunity: evaluateOpportunity({
        acquisitionPrice: options.acquisitionPrice,
        valuation,
        soldEvidence: opportunitySoldEvidence,
        targetMarginPct: options.targetMarginPct
      })
    };
  }

  const security = assessRisk({ item, comparables, valuation });
  const ai = await runSecurityBrain({
    provider: options.aiProvider,
    deterministicRisk: security,
    evidence: comparables,
    timeoutMs: options.aiTimeoutMs ?? 1500
  });

  const result = {
    ...base,
    security,
    ai,
    provenance: buildProvenance(comparables)
  };

  if (options.acquisitionPrice != null) {
    result.opportunity = evaluateOpportunity({
      acquisitionPrice: options.acquisitionPrice,
      valuation,
      security,
      soldEvidence: opportunitySoldEvidence,
      targetMarginPct: options.targetMarginPct
    });
  }

  return result;
}
