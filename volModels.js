/**
 * Volatility Scenario Models
 *
 * Two approaches:
 *
 * 1. Beta Model — Calibrated spot-vol relationship
 *    Δσ(K,T) = [β·ΔS + γ·ΔS²] × exp(-τ·T) × [1 + κ·(K-1)]
 *
 *    - β (spotVolBeta): ATM vol change per 1% spot move. Typically -0.3 to -0.5
 *      for SPX (vol rises when spot falls).
 *    - κ (skewBeta): Amplifies vol change for OTM strikes. OTM puts gain more
 *      vol on down moves than ATM or OTM calls.
 *    - τ (termDecay): Front-end vol moves more than back-end (mean reversion).
 *      Modeled as exponential decay: exp(-τ·T).
 *    - γ (convexity): Vol-of-vol effect — β itself increases for larger moves.
 *      Captures the empirical observation that vol spikes are convex to spot.
 *
 * 2. Manual Mode — Direct user inputs
 *    Δσ(K,T) = (atmChange + skew·(K-1)) × 1/(1 + termMult·√T)
 *
 * REFERENCE_DATE is used to compute time-to-expiry. Update this to match
 * your current trading date.
 */

export const REFERENCE_DATE = new Date('2026-02-06');

export const DEFAULT_BETA_PARAMS = {
  spotVolBeta: -0.40,
  skewBeta: 0.15,
  termDecay: 0.80,
  convexity: 2.0,
};

export const DEFAULT_MANUAL_PARAMS = {
  atmVolChange: 0,
  skewChange: 0.1,
  termMultiplier: 0.5,
};

/**
 * Years to expiry from a date string.
 */
export function yearsToExpiry(expiryStr) {
  const d = new Date(expiryStr);
  const diffMs = d - REFERENCE_DATE;
  const days = Math.max(diffMs / (1000 * 60 * 60 * 24), 1);
  return days / 365.25;
}

/**
 * Days to expiry from a date string.
 */
export function daysToExpiry(expiryStr) {
  const d = new Date(expiryStr);
  return Math.max((d - REFERENCE_DATE) / (1000 * 60 * 60 * 24), 1);
}

/**
 * Beta model vol change at a single (moneyness, expiry) node.
 *
 * @param {number} moneyness - K/S ratio (1.0 = ATM)
 * @param {string} expiryStr - Expiry date string
 * @param {number} spotMove - Fractional spot move (e.g., -0.05 for -5%)
 * @param {Object} params - { spotVolBeta, skewBeta, termDecay, convexity }
 * @returns {number} Vol change in vol points
 */
export function betaVolChange(moneyness, expiryStr, spotMove, params) {
  const T = yearsToExpiry(expiryStr);
  const dS = spotMove * 100; // percentage

  // Core ATM vol change + convexity
  const atmChange =
    params.spotVolBeta * dS +
    params.convexity * dS * dS * Math.sign(params.spotVolBeta) * 0.01;

  // Skew: OTM puts get more vol on down moves
  const mDiff = moneyness - 1.0;
  const skewEffect = 1.0 + params.skewBeta * mDiff * Math.sign(-dS);

  // Term structure: front-end moves more
  const termFactor = Math.exp(-params.termDecay * T);

  return atmChange * skewEffect * termFactor;
}

/**
 * Manual mode vol change at a single (moneyness, expiry) node.
 *
 * @param {number} moneyness
 * @param {string} expiryStr
 * @param {Object} params - { atmVolChange, skewChange, termMultiplier }
 * @returns {number} Vol change in vol points
 */
export function manualVolChange(moneyness, expiryStr, params) {
  const T = yearsToExpiry(expiryStr);
  const mDiff = moneyness - 1.0;
  const termFactor = 1.0 / (1.0 + params.termMultiplier * Math.sqrt(T));
  return (params.atmVolChange + params.skewChange * mDiff) * termFactor;
}

/**
 * Compute vol change at a node using the selected model.
 */
export function computeVolChange(moneyness, expiryStr, spotMove, params, mode) {
  if (mode === 'beta') {
    return betaVolChange(moneyness, expiryStr, spotMove, params);
  }
  return manualVolChange(moneyness, expiryStr, params);
}

/**
 * Classify expiry into a tenor bucket.
 */
export function classifyExpiry(expiryStr) {
  const days = daysToExpiry(expiryStr);
  if (days <= 30) return '0-1M';
  if (days <= 90) return '1-3M';
  if (days <= 180) return '3-6M';
  if (days <= 365) return '6-12M';
  if (days <= 730) return '1-2Y';
  return '2Y+';
}

export const EXPIRY_BUCKET_ORDER = ['0-1M', '1-3M', '3-6M', '6-12M', '1-2Y', '2Y+'];
