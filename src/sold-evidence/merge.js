function evidenceKey(record) {
  const source = String(record?.source || '');
  const sourceId = String(record?.sourceId || '');
  return sourceId ? `${source}:${sourceId}` : null;
}

function dedupe(records = []) {
  const seen = new Set();
  const result = [];

  for (const record of records || []) {
    const key = evidenceKey(record);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    result.push(record);
  }

  return result;
}

export function mergeMarketEvidence(askingEvidence = [], soldEvidence = []) {
  const asking = dedupe(askingEvidence);
  const sold = dedupe(soldEvidence);
  return [...asking, ...sold];
}
