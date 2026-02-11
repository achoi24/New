/**
 * Enhanced Volatility Models
 * ==========================
 * 
 * Two major upgrades over v1:
 * 
 * 1. VOLGA/VANNA EXPANSION
 *    Full second-order P&L:
 *    ΔP(K,T) ≈ Vega·Δσ + ½·Volga·(Δσ)² + Vanna·ΔS·Δσ
 * 
 *    - Volga (d²P/dσ²): Estimated from moneyness. Wing options have high Volga,
 *      ATM has near-zero. Modeled as: VolgaFactor ≈ log(K/S)² / (σ²·T)
 *    - Vanna: Captured implicitly by vega grid interpolation (dVega/dSpot).
 * 
 * 2. HISTORICAL STRESS REPLAY
 *    Replays actual market paths (daily spot + VIX) through the portfolio.
 * 
 * REFERENCE_DATE defaults to today for daily use.
 */

// ─── Reference Date ──────────────────────────────────────────────────────────
export const REFERENCE_DATE = new Date();
REFERENCE_DATE.setHours(0, 0, 0, 0);

// ─── Time Utilities ──────────────────────────────────────────────────────────

export function yearsToExpiry(expiryStr) {
  const d = new Date(expiryStr);
  const days = (d - REFERENCE_DATE) / (1000 * 60 * 60 * 24);
  if (days <= 0) return null;
  return days / 365.25;
}

export function daysToExpiry(expiryStr) {
  const d = new Date(expiryStr);
  const days = (d - REFERENCE_DATE) / (1000 * 60 * 60 * 24);
  if (days <= 0) return null;
  return days;
}

export function isExpired(expiryStr) {
  return daysToExpiry(expiryStr) === null;
}

// ─── Expiry Classification ───────────────────────────────────────────────────

export function classifyExpiry(expiryStr) {
  const days = daysToExpiry(expiryStr);
  if (days === null) return 'Expired';
  if (days <= 30) return '0-1M';
  if (days <= 90) return '1-3M';
  if (days <= 180) return '3-6M';
  if (days <= 365) return '6-12M';
  if (days <= 730) return '1-2Y';
  return '2Y+';
}

export const EXPIRY_BUCKET_ORDER = ['Expired', '0-1M', '1-3M', '3-6M', '6-12M', '1-2Y', '2Y+'];

// ─── Default Parameters ──────────────────────────────────────────────────────

export const DEFAULT_BETA_PARAMS = {
  spotVolBeta: -0.40,
  skewBeta: 0.15,
  termDecay: 0.50,
  convexity: 2.0,
  volgaScale: 0.15,
  termFloor: 0.08,
};

export const DEFAULT_MANUAL_PARAMS = {
  atmVolChange: 0,
  skewChange: 0.1,
  termMultiplier: 0.5,
  volgaScale: 0.15,
};

// ─── Volga Estimation ────────────────────────────────────────────────────────

export function estimateVolgaFactor(moneyness, T) {
  if (T === null || T <= 0) return 0;
  const logM = Math.log(Math.max(moneyness, 0.01));
  const sigmaApprox = 0.20;
  const rawVolga = (logM * logM) / (sigmaApprox * sigmaApprox * Math.max(T, 0.01));
  return Math.min(rawVolga, 10.0);
}

// ─── Beta Vol Model (Enhanced) ───────────────────────────────────────────────

export function betaVolChange(moneyness, expiryStr, spotMove, params) {
  const T = yearsToExpiry(expiryStr);
  if (T === null) return { dSigma: 0, volgaPnL: 0 };

  const dS = spotMove * 100;

  const atmChange = params.spotVolBeta * dS + params.convexity * dS * dS * 0.01;

  const mDiff = moneyness - 1.0;
  const skewMultiplier = Math.max(0.5, Math.min(2.0,
    1.0 - params.skewBeta * mDiff * Math.sign(-dS)
  ));

  const termFactor = Math.max(
    params.termFloor || 0.08,
    Math.exp(-params.termDecay * T)
  );

  const dSigma = atmChange * skewMultiplier * termFactor;

  const volgaFactor = estimateVolgaFactor(moneyness, T);
  const volgaPnL = 0.5 * volgaFactor * dSigma * dSigma * (params.volgaScale || 0);

  return { dSigma, volgaPnL };
}

export function manualVolChange(moneyness, expiryStr, params) {
  const T = yearsToExpiry(expiryStr);
  if (T === null) return { dSigma: 0, volgaPnL: 0 };

  const mDiff = moneyness - 1.0;
  const termFactor = 1.0 / (1.0 + params.termMultiplier * Math.sqrt(T));
  const dSigma = (params.atmVolChange + params.skewChange * mDiff) * termFactor;

  const volgaFactor = estimateVolgaFactor(moneyness, T);
  const volgaPnL = 0.5 * volgaFactor * dSigma * dSigma * (params.volgaScale || 0);

  return { dSigma, volgaPnL };
}

export function computeVolChange(moneyness, expiryStr, spotMove, params, mode) {
  if (mode === 'beta') {
    return betaVolChange(moneyness, expiryStr, spotMove, params);
  }
  return manualVolChange(moneyness, expiryStr, params);
}


// ─── Historical Stress Scenarios ─────────────────────────────────────────────

export const STRESS_SCENARIOS = {
  covid_2020: {
    name: 'COVID-19 Crash',
    dates: 'Feb 19 – Mar 23, 2020',
    description: 'Pandemic selloff. Fast crash with dead-cat bounces. VIX peaked at 83.',
    color: '#ff4757',
    path: [
      [0,0.000,14.4],[1,-0.007,15.6],[2,-0.016,17.1],
      [3,-0.034,18.9],[4,-0.044,18.8],
      [5,-0.079,25.0],[6,-0.086,27.8],[7,-0.115,33.4],
      [8,-0.126,33.9],[9,-0.078,27.6],
      [10,-0.128,39.2],[11,-0.115,36.8],[12,-0.148,41.9],
      [13,-0.079,31.7],
      [14,-0.128,41.9],[15,-0.166,47.3],
      [16,-0.188,54.5],[17,-0.195,57.8],
      [18,-0.145,47.3],
      [19,-0.204,57.8],[20,-0.269,75.5],[21,-0.296,77.7],
      [22,-0.262,65.5],[23,-0.310,82.7],
      [24,-0.278,72.0],[25,-0.340,65.5],
    ],
  },
  volmageddon_2018: {
    name: 'Volmageddon',
    dates: 'Feb 2 – Feb 12, 2018',
    description: 'Short-vol unwind. XIV terminated. Moderate spot, extreme vol spike.',
    color: '#ffa502',
    path: [
      [0,0.000,13.5],[1,-0.022,17.3],[2,-0.042,17.5],
      [3,-0.065,37.3],[4,-0.053,29.0],[5,-0.087,35.5],
      [6,-0.068,33.5],[7,-0.036,27.7],
      [8,-0.053,29.1],[9,-0.035,25.4],
      [10,-0.013,19.4],
    ],
  },
  black_monday_1987: {
    name: 'Black Monday',
    dates: 'Oct 14 – Oct 22, 1987',
    description: 'Single-day crash of -20.5%. Portfolio insurance unwind. Est. VIX ~150.',
    color: '#a855f7',
    path: [
      [0,0.000,16],[1,-0.029,20],[2,-0.060,26],
      [3,-0.097,34],
      [4,-0.305,150],
      [5,-0.253,120],
      [6,-0.295,110],
      [7,-0.220,80],
    ],
  },
  liberation_day_2025: {
    name: 'Liberation Day',
    dates: 'Apr 2 – Apr 9, 2025',
    description: 'Tariff shock. Sharp selloff, partial recovery on 90-day pause.',
    color: '#1e90ff',
    path: [
      [0,0.000,22.3],[1,-0.035,30.0],[2,-0.051,30.0],
      [3,-0.100,45.3],
      [4,-0.120,52.3],
      [5,-0.080,40.2],
      [6,-0.115,46.9],
      [7,-0.072,33.6],
    ],
  },
  carry_unwind_2024: {
    name: 'Yen Carry Unwind',
    dates: 'Jul 31 – Aug 8, 2024',
    description: 'Japanese carry trade unwind. VIX spiked to 66 on moderate spot move.',
    color: '#fbbf24',
    path: [
      [0,0.000,16.4],[1,-0.013,18.6],[2,-0.032,23.4],
      [3,-0.057,29.7],
      [4,-0.085,65.7],
      [5,-0.047,38.6],
      [6,-0.044,27.7],
      [7,-0.027,23.8],
    ],
  },
};

// ─── VIX to Surface Shift ────────────────────────────────────────────────────

export function vixToSurfaceShift(vixChange, moneyness, T, spotReturn) {
  if (T === null || T <= 0) return 0;

  const termRef = 30 / 365.25;
  const termRatio = termRef / Math.max(T, termRef * 0.5);
  const termFactor = Math.max(0.08, Math.pow(termRatio, 0.5));

  const mDiff = moneyness - 1.0;
  const isDown = spotReturn < -0.01;
  const skewFactor = Math.max(0.5, Math.min(2.0,
    isDown ? (1.0 - 0.3 * mDiff) : 1.0
  ));

  return vixChange * termFactor * skewFactor;
}

// ─── Stress Scenario Runner ──────────────────────────────────────────────────

export function runStressScenario(surfaces, scenario, interpolateVegaGrid, params = {}) {
  const volgaScale = params.volgaScale || 0.15;
  const path = scenario.path;
  const vixStart = path[0][2];

  const shifts = Object.keys(surfaces).map(Number).sort((a, b) => a - b);
  const minShift = shifts[0] || -0.075;
  const maxShift = shifts[shifts.length - 1] || 0.075;

  const results = [];
  let cumPnL = 0;
  let prevSpot = 0;
  let prevVix = vixStart;

  for (let i = 0; i < path.length; i++) {
    const [day, spotReturn, vix] = path[i];
    const dailyVixChange = vix - prevVix;
    const clampedSpot = Math.max(minShift, Math.min(maxShift, spotReturn));

    const grid = interpolateVegaGrid(surfaces, clampedSpot);
    if (!grid) {
      results.push({ day, spotReturn: spotReturn * 100, vix, dailyPnL: 0, cumPnL, vegaTotal: 0, clamped: true });
      prevSpot = spotReturn;
      prevVix = vix;
      continue;
    }

    let dailyPnL = 0;
    let vegaTotal = 0;

    for (const row of grid.rows) {
      for (let j = 0; j < row.values.length; j++) {
        const vega = row.values[j];
        if (Math.abs(vega) < 0.001) continue;

        const T = yearsToExpiry(grid.expiries[j]);
        if (T === null) continue;

        const dSigma = vixToSurfaceShift(dailyVixChange, row.moneyness, T, spotReturn);
        const vegaPnL = vega * dSigma;

        const volgaFactor = estimateVolgaFactor(row.moneyness, T);
        const volgaPnLCell = 0.5 * volgaFactor * dSigma * dSigma * volgaScale * Math.abs(vega) * Math.sign(vega);

        dailyPnL += vegaPnL + volgaPnLCell;
        vegaTotal += vega;
      }
    }

    cumPnL += dailyPnL;

    results.push({
      day,
      spotReturn: spotReturn * 100,
      vix,
      dailyPnL,
      cumPnL,
      vegaTotal,
      clamped: Math.abs(spotReturn) > Math.max(Math.abs(minShift), Math.abs(maxShift)),
      dailyVixChange,
    });

    prevSpot = spotReturn;
    prevVix = vix;
  }

  return results;
}
