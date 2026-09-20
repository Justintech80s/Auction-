function clean(value, max = 240) {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ');
  return text ? text.slice(0, max) : null;
}

const GENERIC_FILE = /^(image|images|img|photo|picture|screenshot|download|upload|file)([-_ ]?\d+)?$/i;

export function filenameClues(name) {
  const base = clean(name, 180)?.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[_-]+/g, ' ');
  if (!base || GENERIC_FILE.test(base.trim())) return null;
  const useful = base.replace(/\b(?:img|image|photo|screenshot)\b/ig, ' ').replace(/\s+/g, ' ').trim();
  return useful.length >= 4 ? useful : null;
}

export function barcodeClues(text) {
  const source = String(text ?? '');
  const matches = source.match(/\b\d{8,14}\b/g) || [];
  return [...new Set(matches)].slice(0, 8);
}

export function resolveSignals({ evidence = {}, fileName = null, extractedText = null } = {}) {
  const identifiers = { ...(evidence.identifiers || {}) };
  barcodeClues(extractedText).forEach((value, index) => { identifiers[index === 0 ? 'barcode' : `barcode_${index + 1}`] = value; });

  const text = clean(extractedText, 500);
  const filename = filenameClues(fileName);
  const title = clean(evidence.title) || clean(evidence.pageTitle) || text || filename;

  return {
    ...evidence,
    title,
    pageTitle: clean(evidence.pageTitle) || title,
    identifiers,
    resolverSignals: {
      visual: Boolean(evidence.brand || evidence.model || evidence.confidence > 0.5),
      text: Boolean(text),
      barcode: Object.keys(identifiers).length > 0,
      filename: Boolean(filename)
    }
  };
}

export function weightedMatchSignals(expected = {}, candidate = {}) {
  const norm = value => String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const eq = (a, b) => Boolean(norm(a) && norm(a) === norm(b));
  const contains = (a, b) => Boolean(norm(a) && norm(b) && (norm(a).includes(norm(b)) || norm(b).includes(norm(a))));
  const expectedIds = Object.values(expected.identifiers || {}).map(norm).filter(Boolean);
  const candidateIds = Object.values(candidate.identifiers || {}).map(norm).filter(Boolean);
  if (expectedIds.some(id => candidateIds.includes(id))) return 1;

  const brand = eq(expected.brand, candidate.brand) || contains(candidate.title, expected.brand) ? 1 : 0;
  const name = contains(expected.title, candidate.title) ? 1 : 0;
  const model = eq(expected.model, candidate.model) || contains(candidate.title, expected.model) ? 1 : 0;
  const category = eq(expected.category, candidate.category) ? 1 : 0;
  return Math.min(1, 0.30 * brand + 0.35 * name + 0.25 * model + 0.10 * category);
}
