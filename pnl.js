/**
 * P&L Computation Engine
 *
 * Core formula: P&L(i,j) = Vega(i,j) × Δσ(i,j)
 *
 * Where:
 *   Vega(i,j) = interpolated vega at (moneyness_i, expiry_j) for the target spot move
 *   Δσ(i,j)   = projected vol change at that node from the selected vol model
 */

import { interpolateVegaGrid } from './interpolation.js';
import { computeVolChange, classifyExpiry, EXPIRY_BUCKET_ORDER } from './volModels.js';

/**
 * Compute full P&L breakdown for a single scenario.
 *
 * @param {Object} vegaGrid - Interpolated vega grid { expiries, rows }
 * @param {number} spotMove - Spot move (fraction)
 * @param {Object} volParams - Vol model parameters
 * @param {string} volMode - 'beta' or 'manual'
 * @returns {Object} P&L breakdown
 */
export function computePnL(vegaGrid, spotMove, volParams, volMode) {
  if (!vegaGrid || !vegaGrid.rows || vegaGrid.rows.length === 0) return null;

  // Compute P&L at each cell
  const pnlRows = vegaGrid.rows.map((row) => {
    const pnlValues = row.values.map((vega, ci) => {
      const dSigma = computeVolChange(
        row.moneyness,
        vegaGrid.expiries[ci],
        spotMove,
        volParams,
        volMode
      );
      return vega * dSigma;
    });
    const total = pnlValues.reduce((a, b) => a + b, 0);
    return { moneyness: row.moneyness, values: pnlValues, total };
  });

  // Aggregate by expiry
  const pnlByExpiry = vegaGrid.expiries.map((exp, ci) => {
    const sum = pnlRows.reduce((acc, row) => acc + row.values[ci], 0);
    return { expiry: exp, pnl: sum, bucket: classifyExpiry(exp) };
  });

  // Aggregate by tenor bucket
  const pnlByBucket = {};
  pnlByExpiry.forEach(({ bucket, pnl }) => {
    pnlByBucket[bucket] = (pnlByBucket[bucket] || 0) + pnl;
  });

  // Aggregate by moneyness
  const pnlByMoneyness = pnlRows.map((r) => ({
    moneyness: r.moneyness,
    pnl: r.total,
  }));

  const totalPnL = pnlRows.reduce((acc, row) => acc + row.total, 0);

  return { pnlRows, pnlByExpiry, pnlByBucket, pnlByMoneyness, totalPnL };
}

/**
 * Compute P&L across a range of spot moves for the scenario curve.
 *
 * @param {Object} surfaces - Map of shift -> grid data
 * @param {Object} volParams - Vol model params
 * @param {string} volMode - 'beta' or 'manual'
 * @param {number} step - Spot move step size (default 0.5%)
 * @returns {Array} Array of { spotMove, spotPct, pnl }
 */
export function computeScenarioCurve(surfaces, volParams, volMode, step = 0.005) {
  const results = [];
  for (let s = -0.075; s <= 0.0751; s += step) {
    const sm = Math.round(s * 10000) / 10000;
    const grid = interpolateVegaGrid(surfaces, sm);
    const result = computePnL(grid, sm, volParams, volMode);
    results.push({
      spotMove: sm,
      spotPct: (sm * 100).toFixed(1),
      pnl: result ? result.totalPnL : 0,
    });
  }
  return results;
}

/**
 * Compute 2D scenario matrix (spot × vol change) for manual mode.
 */
export function computeScenarioMatrix(surfaces, baseManualParams, volChanges = [-5, -3, -1, 0, 1, 3, 5]) {
  const results = [];
  for (let s = -0.075; s <= 0.0751; s += 0.01) {
    const sm = Math.round(s * 1000) / 1000;
    const grid = interpolateVegaGrid(surfaces, sm);
    const row = { spotMove: sm };
    volChanges.forEach((dv) => {
      const params = { ...baseManualParams, atmVolChange: dv };
      const result = computePnL(grid, sm, params, 'manual');
      row[`vol_${dv}`] = result ? result.totalPnL : 0;
    });
    results.push(row);
  }
  return results;
}
