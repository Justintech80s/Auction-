export function validateAiResult(result = {}) {
  const classification = String(result.classification || '').trim();
  const confidence = Number(result.confidence);
  const evidenceIds = Array.isArray(result.evidenceIds) ? result.evidenceIds.map((id) => String(id)).slice(0, 50) : [];
  if (!classification || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error('invalid_ai_output');
  }
  return {
    classification: classification.slice(0, 64),
    confidence,
    evidenceIds,
    explanation: String(result.explanation || '').slice(0, 1000),
    decision: ['allow', 'review', 'reject'].includes(result.decision) ? result.decision : undefined
  };
}

export async function withTimeout(operation, timeoutMs = 1500) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('ai_timeout')), Math.max(1, timeoutMs));
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}
