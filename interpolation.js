/**
 * Vega Grid Interpolation Engine
 *
 * Interpolates between pre-computed vega grids at discrete spot shift levels
 * to produce a vega surface at any arbitrary spot move within the grid range.
 *
 * The grids are pinned to absolute strike levels — as spot moves, moneyness
 * shifts relative to the new spot, and the pre-computed grids capture this
 * redistribution effect.
 */

/**
 * Linear interpolation between two bracketing vega grids.
 *
 * @param {Object} surfaces - Map of shift (number) -> parsed grid data
 * @param {number} spotMove - Target spot move (e.g., -0.03 for -3%)
 * @returns {Object} Interpolated grid with same structure as input grids
 */
export function interpolateVegaGrid(surfaces, spotMove) {
  const shifts = Object.keys(surfaces).map(Number).sort((a, b) => a - b);

  if (shifts.length === 0) return null;
  if (shifts.length === 1) return structuredClone(surfaces[shifts[0]]);

  // Clamp to available range
  const clamped = Math.max(shifts[0], Math.min(shifts[shifts.length - 1], spotMove));

  // Find bracketing shifts
  let lowerIdx = 0;
  for (let i = 0; i < shifts.length - 1; i++) {
    if (shifts[i] <= clamped && shifts[i + 1] >= clamped) {
      lowerIdx = i;
      break;
    }
  }

  const s0 = shifts[lowerIdx];
  const s1 = shifts[lowerIdx + 1];

  // Exact match
  if (Math.abs(clamped - s0) < 1e-10) return structuredClone(surfaces[s0]);
  if (Math.abs(clamped - s1) < 1e-10) return structuredClone(surfaces[s1]);

  const t = (clamped - s0) / (s1 - s0);
  const grid0 = surfaces[s0];
  const grid1 = surfaces[s1];

  // Interpolate each cell
  const rows = grid0.rows.map((row, ri) => {
    const row1 = grid1.rows[ri];
    return {
      moneyness: row.moneyness,
      values: row.values.map((v, ci) => {
        const v1 = row1 ? row1.values[ci] : v;
        return v + t * (v1 - v);
      }),
      total: row.total + t * ((row1 ? row1.total : row.total) - row.total),
    };
  });

  const totalRow = grid0.totalRow && grid1.totalRow
    ? {
        values: grid0.totalRow.values.map((v, ci) => {
          const v1 = grid1.totalRow.values[ci];
          return v + t * (v1 - v);
        }),
        total: grid0.totalRow.total + t * (grid1.totalRow.total - grid0.totalRow.total),
      }
    : grid0.totalRow;

  return {
    expiries: grid0.expiries,
    rows,
    totalRow,
  };
}

/**
 * Check if spot move is within the interpolation range.
 */
export function isInRange(surfaces, spotMove) {
  const shifts = Object.keys(surfaces).map(Number).sort((a, b) => a - b);
  if (shifts.length === 0) return false;
  return spotMove >= shifts[0] && spotMove <= shifts[shifts.length - 1];
}

/**
 * Get the available shift range.
 */
export function getShiftRange(surfaces) {
  const shifts = Object.keys(surfaces).map(Number).sort((a, b) => a - b);
  return { min: shifts[0] || -0.075, max: shifts[shifts.length - 1] || 0.075, shifts };
}
