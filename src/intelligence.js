function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokens(value) {
  return new Set(normalizeText(value).split(/\s+/).filter(Boolean));
}

export function buildSearchQuery(item = {}) {
  return [item.brand, item.model, item.category, item.year]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' ');
}

export function scoreComparable(item = {}, comparable = {}) {
  const title = normalizeText(comparable.title);
  if (!title) return 0;

  const brand = normalizeText(item.brand);
  const model = normalizeText(item.model);
  const category = normalizeText(item.category);
  const year = normalizeText(item.year);

  let score = 0;
  let possible = 0;

  if (brand) {
    possible += 0.25;
    if (title.includes(brand)) score += 0.25;
  }

  if (model) {
    possible += 0.45;
    if (title.includes(model)) score += 0.45;
    else {
      const modelPrefix = model.split(' ')[0].split('-')[0];
      const titleTokens = [...tokens(title)];
      if (modelPrefix && titleTokens.some((token) => token.startsWith(modelPrefix) && token !== model)) {
        score -= 0.15;
      }
    }
  }

  if (category) {
    possible += 0.2;
    const categoryTokens = [...tokens(category)];
    const matched = categoryTokens.filter((token) => title.includes(token)).length;
    score += 0.2 * (matched / categoryTokens.length);
  }

  if (year) {
    possible += 0.1;
    if (title.includes(year)) score += 0.1;
  }

  if (!possible) return 0;
  return Math.round(Math.max(0, Math.min(1, score / possible)) * 100) / 100;
}

export function rankComparables(item, comparables = []) {
  return comparables
    .map((comparable) => ({ ...comparable, similarity: scoreComparable(item, comparable) }))
    .sort((a, b) => b.similarity - a.similarity);
}
