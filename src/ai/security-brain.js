import { validateAiResult, withTimeout } from './provider-contract.js';

export function isolateUntrustedEvidence(evidence = {}) {
  return {
    trust: 'untrusted_evidence',
    id: String(evidence.id || '').slice(0, 128),
    title: String(evidence.title || '').slice(0, 512),
    description: String(evidence.description || '').slice(0, 1000)
  };
}

function evidenceId(entry = {}) {
  return `${entry.source || ''}:${entry.sourceId || ''}`;
}

export async function runSecurityBrain({ provider, deterministicRisk, evidence = [], timeoutMs = 1500 } = {}) {
  const baseDecision = deterministicRisk?.decision || 'review';
  if (typeof provider !== 'function') {
    return { status: 'disabled', effectiveDecision: baseDecision, evidenceIds: [], confidence: 0 };
  }

  try {
    const allowedIds = new Set(evidence.map(evidenceId).filter((id) => id !== ':'));
    const isolated = evidence.map((entry) => isolateUntrustedEvidence({
      id: evidenceId(entry),
      title: entry.title,
      description: entry.description
    }));
    const raw = await withTimeout(() => provider({
      task: 'auction_security_review',
      deterministicRisk,
      evidence: isolated
    }), timeoutMs);
    const parsed = validateAiResult(raw);
    const cited = parsed.evidenceIds.filter((id) => allowedIds.has(id));

    return {
      status: 'ok',
      classification: parsed.classification,
      confidence: parsed.confidence,
      evidenceIds: cited,
      explanation: parsed.explanation,
      suggestedDecision: parsed.decision,
      effectiveDecision: baseDecision
    };
  } catch {
    return {
      status: 'unavailable',
      effectiveDecision: baseDecision,
      evidenceIds: [],
      confidence: 0
    };
  }
}
