/**
 * P&L Computation Engine (v2 — with Volga)
 *
 * P&L(i,j) = Vega(i,j) × Δσ(i,j) + Vega(i,j) × VolgaPnL(i,j)
 *
 * The computeVolChange function now returns { dSigma, volgaPnL }
 * so total effective vol change per cell = dSigma + volgaPnL
 */

import { interpolateVegaGrid } from './interpolation.js';
import { computeVolChange, classifyExpiry, EXPIRY_BUCKET_ORDER } from './volModels.js';

/**
 * Compute full P&L breakdown for a single scenario.
 */
export function computePnL(vegaGrid, spotMove, volParams, volMode) {
  if (!vegaGrid || !vegaGrid.rows || vegaGrid.rows.length === 0) return null;

  let totalVolgaContrib = 0;

  const pnlRows = vegaGrid.rows.map((row) => {
    const pnlValues = row.values.map((vega, ci) => {
      const { dSigma, volgaPnL } = computeVolChange(
        row.moneyness,
        vegaGrid.expiries[ci],
        spotMove,
        volParams,
        volMode
      );
      // First order + second order
      const cellPnL = vega * dSigma + vega * volgaPnL;
      totalVolgaContrib += vega * volgaPnL;
      return cellPnL;
    });
    const total = pnlValues.reduce((a, b) => a + b, 0);
    return { moneyness: row.moneyness, values: pnlValues, total };
  });

  const pnlByExpiry = vegaGrid.expiries.map((exp, ci) => {
    const sum = pnlRows.reduce((acc, row) => acc + row.values[ci], 0);
    return { expiry: exp, pnl: sum, bucket: classifyExpiry(exp) };
  });

  const pnlByBucket = {};
  pnlByExpiry.forEach(({ bucket, pnl }) => {
    pnlByBucket[bucket] = (pnlByBucket[bucket] || 0) + pnl;
  });

  const pnlByMoneyness = pnlRows.map((r) => ({
    moneyness: r.moneyness,
    pnl: r.total,
  }));

  const totalPnL = pnlRows.reduce((acc, row) => acc + row.total, 0);

  return {
    pnlRows,
    pnlByExpiry,
    pnlByBucket,
    pnlByMoneyness,
    totalPnL,
    volgaContribution: totalVolgaContrib,
  };
}
