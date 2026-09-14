function normalizeText(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeCompact(value) {
  return normalizeText(value).replace(/\s+/g, '');
}

function sameText(left, right) {
  const a = normalizeCompact(left);
  const b = normalizeCompact(right);
  return Boolean(a && b && a === b);
}

function categoryCompatible(left, right) {
  const a = new Set(normalizeText(left).split(/\s+/).filter(Boolean));
  const b = new Set(normalizeText(right).split(/\s+/).filter(Boolean));
  if (!a.size || !b.size) return true;
  return [...a].some(token => b.has(token));
}

const ACCESSORY_PATTERNS = Object.freeze([
  /\breplacement\b/,
  /\bcharger\b/,
  /\bpower adapter\b/,
  /\bempty box\b/,
  /\bbox only\b/,
  /\bcase only\b/,
  /\bfor parts\b/,
  /\baccessor(?:y|ies)\b/,
  /\bkeyboard for\b/,
  /\bbattery for\b/,
  /\bscreen for\b/
]);

function looksLikeAccessory(title) {
  const text = normalizeText(title);
  return ACCESSORY_PATTERNS.some(pattern => pattern.test(text));
}

function canonicalSpecKey(key) {
  const compact = normalizeCompact(key);
  const aliases = {
    memory: 'ram',
    systemmemory: 'ram',
    ram: 'ram',
    storage: 'storage',
    storagesize: 'storage',
    capacity: 'storage',
    screensize: 'screenSize',
    displaysize: 'screenSize',
    screen: 'screenSize',
    cpu: 'cpu',
    processor: 'cpu',
    gpu: 'gpu',
    graphics: 'gpu',
    graphicsprocessor: 'gpu',
    carrier: 'carrier',
    network: 'carrier',
    unlocked: 'unlocked',
    lockstatus: 'unlocked',
    size: 'size'
  };
  return aliases[compact] || compact;
}

function canonicalSpecs(specs = {}) {
  const output = {};
  if (!specs || typeof specs !== 'object' || Array.isArray(specs)) return output;
  for (const [key, value] of Object.entries(specs)) {
    const canonicalKey = canonicalSpecKey(key);
    const canonicalValue = normalizeCompact(value);
    if (canonicalKey && canonicalValue) output[canonicalKey] = canonicalValue;
  }
  return output;
}

function materialKeys(category) {
  const normalized = normalizeText(category);
  if (/\blaptop\b|\bnotebook\b|\bcomputer\b/.test(normalized)) {
    return ['ram', 'storage', 'screenSize', 'cpu', 'gpu'];
  }
  if (/\bphone\b|\bsmartphone\b|\bmobile\b/.test(normalized)) {
    return ['storage', 'carrier', 'unlocked'];
  }
  if (/\btv\b|\btelevision\b/.test(normalized)) {
    return ['size'];
  }
  return Object.keys(canonicalSpecs({}));
}

function sharedIdentifierState(identityIdentifiers = {}, offerIdentifiers = {}) {
  const identity = Object.fromEntries(
    Object.entries(identityIdentifiers || {}).map(([key, value]) => [normalizeCompact(key), normalizeCompact(value)])
  );
  const offer = Object.fromEntries(
    Object.entries(offerIdentifiers || {}).map(([key, value]) => [normalizeCompact(key), normalizeCompact(value)])
  );

  let matched = false;
  for (const [key, value] of Object.entries(identity)) {
    if (!value || !offer[key]) continue;
    if (offer[key] !== value) return { matched: false, conflict: true };
    matched = true;
  }
  return { matched, conflict: false };
}

function rounded(value) {
  return Math.round(Math.max(0, Math.min(1, value)) * 100) / 100;
}

export function matchOffer(identity = {}, offer = {}) {
  const reasons = [];

  if (looksLikeAccessory(offer.title)) {
    return Object.freeze({ classification: 'rejected', score: 0, reasons: Object.freeze(['accessory_or_parts_listing']) });
  }

  const identifierState = sharedIdentifierState(identity.identifiers, offer.identifiers);
  if (identifierState.conflict) {
    return Object.freeze({ classification: 'rejected', score: 0, reasons: Object.freeze(['identifier_conflict']) });
  }

  const identityBrand = normalizeCompact(identity.brand);
  const offerBrand = normalizeCompact(offer.brand);
  if (identityBrand && offerBrand && identityBrand !== offerBrand) {
    return Object.freeze({ classification: 'rejected', score: 0, reasons: Object.freeze(['brand_conflict']) });
  }

  const identityModel = normalizeCompact(identity.model);
  const offerModel = normalizeCompact(offer.model);
  if (identityModel && offerModel && identityModel !== offerModel) {
    return Object.freeze({ classification: 'rejected', score: 0, reasons: Object.freeze(['model_conflict']) });
  }

  if (identity.category && offer.category && !categoryCompatible(identity.category, offer.category)) {
    return Object.freeze({ classification: 'rejected', score: 0, reasons: Object.freeze(['category_conflict']) });
  }

  const identitySpecs = canonicalSpecs(identity.specs);
  const offerSpecs = canonicalSpecs(offer.specs);
  const keys = materialKeys(identity.category || offer.category)
    .filter(key => identitySpecs[key]);

  let matchedSpecs = 0;
  let missingSpecs = 0;
  for (const key of keys) {
    if (!offerSpecs[key]) {
      missingSpecs += 1;
      reasons.push(`missing_spec:${key}`);
      continue;
    }
    if (offerSpecs[key] !== identitySpecs[key]) {
      return Object.freeze({
        classification: 'rejected',
        score: 0,
        reasons: Object.freeze([`spec_conflict:${key}`])
      });
    }
    matchedSpecs += 1;
  }

  let score = 0;
  let possible = 0;

  if (identityBrand && offerBrand) {
    possible += 0.15;
    if (identityBrand === offerBrand) score += 0.15;
  }
  if (identityModel && offerModel) {
    possible += 0.25;
    if (identityModel === offerModel) score += 0.25;
  }
  if (identity.category && offer.category) {
    possible += 0.10;
    if (categoryCompatible(identity.category, offer.category)) score += 0.10;
  }
  if (identifierState.matched) {
    possible += 0.20;
    score += 0.20;
    reasons.push('strong_identifier_match');
  }
  if (keys.length > 0) {
    possible += 0.30;
    score += 0.30 * (matchedSpecs / keys.length);
  }

  const normalizedScore = possible > 0 ? rounded(score / possible) : 0;
  const brandModelExact = Boolean(identityBrand && offerBrand && identityModel && offerModel
    && identityBrand === offerBrand && identityModel === offerModel);
  const identityBacked = identifierState.matched || brandModelExact;
  const allMaterialSpecsPresent = missingSpecs === 0;

  if (identityBacked && allMaterialSpecsPresent) {
    reasons.push('exact_identity_match');
    return Object.freeze({
      classification: 'exact',
      score: normalizedScore,
      reasons: Object.freeze(reasons)
    });
  }

  if (normalizedScore > 0 || identityBacked) {
    reasons.push('partial_identity_match');
    return Object.freeze({
      classification: 'similar',
      score: normalizedScore,
      reasons: Object.freeze(reasons)
    });
  }

  return Object.freeze({ classification: 'rejected', score: 0, reasons: Object.freeze(['insufficient_identity_match']) });
}
