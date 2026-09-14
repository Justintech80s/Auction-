import { normalizeOffer, normalizeProductIdentity, PRODUCT_CONDITIONS } from './contracts.js';
import { matchOffer } from './matcher.js';
import { screenMatchedOffers } from './offer-guardian.js';

function emptyGroup() {
  return {
    offerIds: [],
    cheapestItemId: null,
    cheapestTotalId: null,
    bestExactId: null
  };
}

function byItemPrice(left, right) {
  return left.offer.itemPrice - right.offer.itemPrice
    || (left.offer.trustTier === 'trusted' ? -1 : 1)
    || right.offer.sourceConfidence - left.offer.sourceConfidence;
}

function byConfirmedTotal(left, right) {
  return left.offer.estimatedTotal - right.offer.estimatedTotal
    || byItemPrice(left, right);
}

function byBestExact(left, right) {
  return right.match.score - left.match.score
    || (left.offer.trustTier === right.offer.trustTier ? 0 : left.offer.trustTier === 'trusted' ? -1 : 1)
    || right.offer.sourceConfidence - left.offer.sourceConfidence
    || ((left.offer.estimatedTotal ?? left.offer.itemPrice) - (right.offer.estimatedTotal ?? right.offer.itemPrice));
}

export function rankOffers(identityInput, offerInputs = []) {
  if (!Array.isArray(offerInputs)) throw new TypeError('offers must be an array');
  const identity = normalizeProductIdentity(identityInput, { now: identityInput?.capturedAt });
  const normalizedOffers = offerInputs.map(offer => normalizeOffer(offer));
  const matched = normalizedOffers.map(offer => ({ offer, match: matchOffer(identity, offer) }));
  const screened = screenMatchedOffers(matched);

  const groups = Object.fromEntries(PRODUCT_CONDITIONS.map(condition => [condition, emptyGroup()]));

  for (const entry of screened) {
    const condition = PRODUCT_CONDITIONS.includes(entry.offer.condition) ? entry.offer.condition : 'unknown';
    groups[condition].offerIds.push(entry.offer.offerId);
  }

  for (const condition of PRODUCT_CONDITIONS) {
    const safeExact = screened.filter(entry =>
      entry.offer.condition === condition
      && entry.match.classification === 'exact'
      && entry.guardianDecision === 'allow'
    );

    const cheapestItem = [...safeExact].sort(byItemPrice)[0] || null;
    const cheapestTotal = safeExact
      .filter(entry => entry.offer.estimatedTotal !== null)
      .sort(byConfirmedTotal)[0] || null;
    const bestExact = [...safeExact].sort(byBestExact)[0] || null;

    groups[condition].cheapestItemId = cheapestItem?.offer?.offerId ?? null;
    groups[condition].cheapestTotalId = cheapestTotal?.offer?.offerId ?? null;
    groups[condition].bestExactId = bestExact?.offer?.offerId ?? null;
    groups[condition] = Object.freeze({
      offerIds: Object.freeze([...groups[condition].offerIds]),
      cheapestItemId: groups[condition].cheapestItemId,
      cheapestTotalId: groups[condition].cheapestTotalId,
      bestExactId: groups[condition].bestExactId
    });
  }

  const offers = screened.map(entry => Object.freeze({
    ...entry.offer,
    matchClassification: entry.match.classification,
    matchScore: entry.match.score,
    matchReasons: entry.match.reasons,
    guardianDecision: entry.guardianDecision,
    guardianReasons: entry.guardianReasons
  }));

  return Object.freeze({
    identity,
    offers: Object.freeze(offers),
    groups: Object.freeze(groups)
  });
}
