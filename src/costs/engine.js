const COST_FIELDS = Object.freeze([
  'marketplaceFee',
  'shipping',
  'tax',
  'repairs',
  'paymentProcessing',
  'holding'
]);

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function requireFiniteNonNegative(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new TypeError(`${field} must be a finite non-negative number`);
  }
  return number;
}

function normalizeCosts(costs) {
  if (costs == null) costs = {};
  if (typeof costs !== 'object' || Array.isArray(costs)) {
    throw new TypeError('costs must be an object');
  }

  const raw = {};
  const rounded = {};
  for (const field of COST_FIELDS) {
    const value = costs[field] == null ? 0 : requireFiniteNonNegative(costs[field], field);
    raw[field] = value;
    rounded[field] = round(value);
  }

  return { raw, rounded };
}

export function calculateNetEconomics({
  acquisitionPrice,
  estimatedValue,
  costs
} = {}) {
  const acquisition = requireFiniteNonNegative(acquisitionPrice, 'acquisitionPrice');
  const estimate = Number(estimatedValue);
  if (!Number.isFinite(estimate) || estimate <= 0) {
    throw new TypeError('estimatedValue must be a positive finite number');
  }

  const normalized = normalizeCosts(costs);
  const totalCostsRaw = COST_FIELDS.reduce((sum, field) => sum + normalized.raw[field], 0);
  const grossProfitRaw = estimate - acquisition;
  const netProfitRaw = grossProfitRaw - totalCostsRaw;

  return Object.freeze({
    costBreakdown: Object.freeze(normalized.rounded),
    totalCosts: round(totalCostsRaw),
    grossProfit: round(grossProfitRaw),
    grossMarginPct: round((grossProfitRaw / estimate) * 100),
    netProfit: round(netProfitRaw),
    netMarginPct: round((netProfitRaw / estimate) * 100)
  });
}
