"""
Vega P&L Risk Engine
====================
Core computation module: CSV parsing, vega interpolation, vol scenario models, P&L projection.

This module can be used standalone (imported in scripts/notebooks) or via the FastAPI server.
"""

import numpy as np
import pandas as pd
from scipy.interpolate import interp1d
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple
from datetime import datetime, date
from pathlib import Path
import json
import warnings

warnings.filterwarnings("ignore")


# ─── Data Structures ──────────────────────────────────────────────────────────

@dataclass
class VegaGrid:
    """Single vega surface at a specific spot shift level."""
    spot_shift: float
    moneyness: np.ndarray          # (N,) moneyness values
    expiries: List[str]            # expiry date strings
    expiry_years: np.ndarray       # (M,) years to expiry
    values: np.ndarray             # (N, M) vega matrix
    row_totals: np.ndarray         # (N,) sum across expiries
    col_totals: np.ndarray         # (M,) sum across moneyness
    total: float                   # grand total

    @property
    def n_strikes(self) -> int:
        return len(self.moneyness)

    @property
    def n_expiries(self) -> int:
        return len(self.expiries)


@dataclass
class BetaParams:
    """Parameters for the calibrated spot-vol beta model."""
    spot_vol_beta: float = -0.40   # ATM vol change per 1% spot move
    skew_beta: float = 0.15        # additional vol for OTM strikes
    term_decay: float = 0.50       # exponential decay across term structure
    convexity: float = 2.0         # vol-of-vol effect on large moves
    volga_scale: float = 0.15      # second-order vol P&L scaling
    term_floor: float = 0.08       # minimum term factor for long-dated


@dataclass
class ManualParams:
    """Parameters for manual vol scenario mode."""
    atm_vol_change: float = 0.0    # parallel shift in vol points
    skew_change: float = 0.1       # vol per unit moneyness deviation
    term_multiplier: float = 0.5   # dampens vol change for longer tenors
    volga_scale: float = 0.15      # second-order vol P&L scaling


@dataclass
class PnLResult:
    """Complete P&L breakdown for a scenario."""
    total_pnl: float
    pnl_grid: np.ndarray                        # (N, M) P&L matrix
    pnl_by_expiry: Dict[str, float]             # expiry -> P&L
    pnl_by_bucket: Dict[str, float]             # bucket -> P&L
    pnl_by_moneyness: Dict[float, float]        # moneyness -> P&L
    vega_grid: VegaGrid                         # the interpolated vega grid
    vol_change_grid: np.ndarray                 # (N, M) vol changes applied
    spot_move: float
    vol_params: dict


# ─── CSV Parsing ──────────────────────────────────────────────────────────────

REFERENCE_DATE = date(2026, 2, 6)

FILE_SHIFT_MAP = {
    "down_75": -0.075,
    "down_50": -0.05,
    "down_25": -0.025,
    "atm": 0.0,
    "up_25": 0.025,
    "up_50": 0.05,
    "up_75": 0.075,
}


def detect_shift_from_filename(filename: str) -> Optional[float]:
    """Extract spot shift from filename based on naming convention."""
    name = Path(filename).stem.lower()
    for key, shift in FILE_SHIFT_MAP.items():
        if key in name:
            return shift
    return None


def parse_csv(filepath: str, spot_shift: float = None, ref_date: date = None) -> VegaGrid:
    """
    Parse a vega surface CSV file.

    Expected format:
    - Row 0: blank, expiry1, expiry2, ..., TOTAL
    - Row 1..N: moneyness, vega_1, vega_2, ..., row_total
    - Last row: blank, col_total_1, col_total_2, ..., grand_total
    """
    if ref_date is None:
        ref_date = REFERENCE_DATE

    if spot_shift is None:
        spot_shift = detect_shift_from_filename(filepath)
        if spot_shift is None:
            raise ValueError(f"Cannot detect spot shift from filename: {filepath}")

    df = pd.read_csv(filepath, header=0, index_col=0)

    # Drop the TOTAL column if present
    if "TOTAL" in df.columns:
        row_totals_col = df["TOTAL"]
        df = df.drop(columns=["TOTAL"])
    else:
        row_totals_col = None

    # Separate data rows from the summary row (last row with NaN index)
    mask = df.index.notna()
    data_df = df[mask].copy()
    summary_row = df[~mask]

    # Parse moneyness
    moneyness = data_df.index.astype(float).values

    # Parse expiries
    expiry_strs = [str(c).strip() for c in data_df.columns]

    # Compute years to expiry
    expiry_years = np.array([
        max((pd.Timestamp(e) - pd.Timestamp(ref_date)).days / 365.25, 1 / 365.25)
        for e in expiry_strs
    ])

    # Vega matrix
    values = data_df.values.astype(float)

    # Row totals
    if row_totals_col is not None:
        row_totals = row_totals_col[mask].values.astype(float)
    else:
        row_totals = values.sum(axis=1)

    # Column totals
    if len(summary_row) > 0:
        col_totals = summary_row.iloc[0].values.astype(float)
    else:
        col_totals = values.sum(axis=0)

    total = float(row_totals.sum())

    return VegaGrid(
        spot_shift=spot_shift,
        moneyness=moneyness,
        expiries=expiry_strs,
        expiry_years=expiry_years,
        values=values,
        row_totals=row_totals,
        col_totals=col_totals,
        total=total,
    )


def load_surfaces(directory: str, prefix: str = "SPX") -> Dict[float, VegaGrid]:
    """Load all vega surface CSVs from a directory matching a prefix."""
    surfaces = {}
    data_dir = Path(directory)
    for f in data_dir.glob(f"{prefix}*.csv"):
        shift = detect_shift_from_filename(f.name)
        if shift is not None:
            grid = parse_csv(str(f), spot_shift=shift)
            surfaces[shift] = grid
    return dict(sorted(surfaces.items()))


# ─── Interpolation Engine ─────────────────────────────────────────────────────

def interpolate_vega_grid(
    surfaces: Dict[float, VegaGrid],
    spot_move: float,
    method: str = "linear"
) -> VegaGrid:
    """
    Interpolate vega grid at an arbitrary spot move between available surface shifts.

    Parameters
    ----------
    surfaces : dict mapping spot_shift -> VegaGrid
    spot_move : target spot move (e.g., -0.03 for -3%)
    method : 'linear' or 'cubic'

    Returns
    -------
    VegaGrid at the interpolated spot level
    """
    shifts = sorted(surfaces.keys())
    if len(shifts) == 0:
        raise ValueError("No surfaces provided")

    if len(shifts) == 1:
        return surfaces[shifts[0]]

    # Clamp to available range
    clamped = np.clip(spot_move, shifts[0], shifts[-1])

    # If exact match, return directly
    if clamped in surfaces:
        grid = surfaces[clamped]
        return VegaGrid(
            spot_shift=spot_move,
            moneyness=grid.moneyness.copy(),
            expiries=grid.expiries[:],
            expiry_years=grid.expiry_years.copy(),
            values=grid.values.copy(),
            row_totals=grid.row_totals.copy(),
            col_totals=grid.col_totals.copy(),
            total=grid.total,
        )

    # Get reference grid for structure
    ref = surfaces[shifts[0]]
    n_strikes, n_expiries = ref.values.shape

    # Build interpolated values cell by cell
    shift_arr = np.array(shifts)
    interp_values = np.zeros((n_strikes, n_expiries))

    for i in range(n_strikes):
        for j in range(n_expiries):
            y_vals = np.array([surfaces[s].values[i, j] for s in shifts])

            if method == "cubic" and len(shifts) >= 4:
                f = interp1d(shift_arr, y_vals, kind="cubic", fill_value="extrapolate")
            else:
                f = interp1d(shift_arr, y_vals, kind="linear", fill_value="extrapolate")

            interp_values[i, j] = f(clamped)

    row_totals = interp_values.sum(axis=1)
    col_totals = interp_values.sum(axis=0)
    total = float(interp_values.sum())

    return VegaGrid(
        spot_shift=spot_move,
        moneyness=ref.moneyness.copy(),
        expiries=ref.expiries[:],
        expiry_years=ref.expiry_years.copy(),
        values=interp_values,
        row_totals=row_totals,
        col_totals=col_totals,
        total=total,
    )


# ─── Vol Scenario Models ──────────────────────────────────────────────────────

def beta_vol_change(
    moneyness: float,
    years_to_expiry: float,
    spot_move: float,
    params: BetaParams,
) -> tuple:
    """
    Compute vol change at a single (moneyness, expiry) node using the beta model.

    Returns (dSigma, volgaPnL) where:
      dSigma: first-order vol change
      volgaPnL: ½·VolgaFactor·(Δσ)² per unit vega

    Enhanced with: convexity fix, skew fix, term floor, Volga estimation.
    """
    dS = spot_move * 100

    # Core ATM vol change + convexity (always amplifies)
    atm_change = params.spot_vol_beta * dS + params.convexity * dS * dS * 0.01

    # Skew: OTM puts get MORE vol on down moves (fixed sign)
    m_diff = moneyness - 1.0
    skew_effect = np.clip(1.0 - params.skew_beta * m_diff * np.sign(-dS), 0.5, 2.0)

    # Term structure with floor
    term_factor = max(params.term_floor, np.exp(-params.term_decay * years_to_expiry))

    dSigma = atm_change * skew_effect * term_factor

    # Volga: ½ · VolgaFactor · (Δσ)²
    log_m = np.log(max(moneyness, 0.01))
    sigma_approx = 0.20
    volga_factor = min((log_m ** 2) / (sigma_approx ** 2 * max(years_to_expiry, 0.01)), 10.0)
    volga_pnl = 0.5 * volga_factor * dSigma * dSigma * params.volga_scale

    return dSigma, volga_pnl


def manual_vol_change(
    moneyness: float,
    years_to_expiry: float,
    params: ManualParams,
) -> tuple:
    """
    Compute vol change using manual scenario inputs.
    Returns (dSigma, volgaPnL).
    """
    m_diff = moneyness - 1.0
    term_factor = 1.0 / (1.0 + params.term_multiplier * np.sqrt(years_to_expiry))
    dSigma = (params.atm_vol_change + params.skew_change * m_diff) * term_factor

    log_m = np.log(max(moneyness, 0.01))
    sigma_approx = 0.20
    volga_factor = min((log_m ** 2) / (sigma_approx ** 2 * max(years_to_expiry, 0.01)), 10.0)
    volga_pnl = 0.5 * volga_factor * dSigma * dSigma * params.volga_scale

    return dSigma, volga_pnl


def compute_vol_change_grid(
    grid: VegaGrid,
    spot_move: float,
    vol_mode: str = "beta",
    beta_params: BetaParams = None,
    manual_params: ManualParams = None,
) -> tuple:
    """
    Compute the full vol change matrix for a vega grid.

    Returns (vol_changes, volga_pnl) — both (N, M) arrays.
    """
    if beta_params is None:
        beta_params = BetaParams()
    if manual_params is None:
        manual_params = ManualParams()

    n, m = grid.values.shape
    vol_changes = np.zeros((n, m))
    volga_pnl = np.zeros((n, m))

    for i in range(n):
        for j in range(m):
            if vol_mode == "beta":
                ds, vp = beta_vol_change(
                    grid.moneyness[i], grid.expiry_years[j], spot_move, beta_params
                )
            else:
                ds, vp = manual_vol_change(
                    grid.moneyness[i], grid.expiry_years[j], manual_params
                )
            vol_changes[i, j] = ds
            volga_pnl[i, j] = vp

    return vol_changes, volga_pnl


# ─── P&L Computation ──────────────────────────────────────────────────────────

EXPIRY_BUCKET_THRESHOLDS = [
    (30, "0-1M"),
    (90, "1-3M"),
    (180, "3-6M"),
    (365, "6-12M"),
    (730, "1-2Y"),
    (float("inf"), "2Y+"),
]


def classify_expiry(expiry_str: str, ref_date: date = None) -> str:
    """Classify an expiry date into a tenor bucket."""
    if ref_date is None:
        ref_date = REFERENCE_DATE
    exp_date = pd.Timestamp(expiry_str).date()
    days = (exp_date - ref_date).days
    for threshold, label in EXPIRY_BUCKET_THRESHOLDS:
        if days <= threshold:
            return label
    return "2Y+"


def compute_pnl(
    surfaces: Dict[float, VegaGrid],
    spot_move: float,
    vol_mode: str = "beta",
    beta_params: BetaParams = None,
    manual_params: ManualParams = None,
    interp_method: str = "linear",
) -> PnLResult:
    """
    Full P&L computation pipeline.

    1. Interpolate vega grid at the target spot move
    2. Compute vol change grid based on the selected model
    3. P&L = Vega × ΔVol at each cell
    4. Aggregate by expiry, bucket, and moneyness

    Parameters
    ----------
    surfaces : dict of spot_shift -> VegaGrid
    spot_move : target spot move (fraction)
    vol_mode : 'beta' or 'manual'
    beta_params : parameters for beta model
    manual_params : parameters for manual model
    interp_method : 'linear' or 'cubic'

    Returns
    -------
    PnLResult with full breakdown
    """
    if beta_params is None:
        beta_params = BetaParams()
    if manual_params is None:
        manual_params = ManualParams()

    # Step 1: Interpolate vega grid
    vega_grid = interpolate_vega_grid(surfaces, spot_move, method=interp_method)

    # Step 2: Compute vol changes + Volga
    vol_changes, volga_grid = compute_vol_change_grid(
        vega_grid, spot_move, vol_mode, beta_params, manual_params
    )

    # Step 3: P&L = Vega × ΔVol + Vega × VolgaPnL
    pnl_grid = vega_grid.values * vol_changes + vega_grid.values * volga_grid

    # Step 4: Aggregations
    total_pnl = float(pnl_grid.sum())

    # By expiry
    pnl_by_expiry = {}
    for j, exp in enumerate(vega_grid.expiries):
        pnl_by_expiry[exp] = float(pnl_grid[:, j].sum())

    # By bucket
    pnl_by_bucket = {}
    for j, exp in enumerate(vega_grid.expiries):
        bucket = classify_expiry(exp)
        pnl_by_bucket[bucket] = pnl_by_bucket.get(bucket, 0.0) + float(pnl_grid[:, j].sum())

    # By moneyness
    pnl_by_moneyness = {}
    for i, m in enumerate(vega_grid.moneyness):
        pnl_by_moneyness[float(m)] = float(pnl_grid[i, :].sum())

    # Vol params used
    if vol_mode == "beta":
        vp = {
            "mode": "beta",
            "spot_vol_beta": beta_params.spot_vol_beta,
            "skew_beta": beta_params.skew_beta,
            "term_decay": beta_params.term_decay,
            "convexity": beta_params.convexity,
        }
    else:
        vp = {
            "mode": "manual",
            "atm_vol_change": manual_params.atm_vol_change,
            "skew_change": manual_params.skew_change,
            "term_multiplier": manual_params.term_multiplier,
        }

    return PnLResult(
        total_pnl=total_pnl,
        pnl_grid=pnl_grid,
        pnl_by_expiry=pnl_by_expiry,
        pnl_by_bucket=pnl_by_bucket,
        pnl_by_moneyness=pnl_by_moneyness,
        vega_grid=vega_grid,
        vol_change_grid=vol_changes,
        spot_move=spot_move,
        vol_params=vp,
    )


# ─── Scenario Matrix ──────────────────────────────────────────────────────────

def compute_scenario_matrix(
    surfaces: Dict[float, VegaGrid],
    spot_moves: List[float] = None,
    vol_mode: str = "beta",
    beta_params: BetaParams = None,
    manual_params: ManualParams = None,
    vol_changes_override: List[float] = None,
) -> pd.DataFrame:
    """
    Compute P&L across a grid of spot moves.

    For beta mode: computes P&L at each spot move (vol follows from the model).
    For manual mode with vol_changes_override: computes 2D grid of spot × vol.

    Returns DataFrame with results.
    """
    if spot_moves is None:
        spot_moves = [round(s, 4) for s in np.arange(-0.075, 0.076, 0.005)]

    if beta_params is None:
        beta_params = BetaParams()
    if manual_params is None:
        manual_params = ManualParams()

    if vol_mode == "beta":
        results = []
        for sm in spot_moves:
            r = compute_pnl(surfaces, sm, "beta", beta_params)
            results.append({"spot_move": sm, "total_pnl": r.total_pnl})
            for bucket, pnl in r.pnl_by_bucket.items():
                results[-1][f"pnl_{bucket}"] = pnl
        return pd.DataFrame(results)
    else:
        if vol_changes_override is None:
            vol_changes_override = [-5, -3, -1, 0, 1, 3, 5]
        results = []
        for sm in spot_moves:
            row = {"spot_move": sm}
            for dv in vol_changes_override:
                mp = ManualParams(
                    atm_vol_change=dv,
                    skew_change=manual_params.skew_change,
                    term_multiplier=manual_params.term_multiplier,
                )
                r = compute_pnl(surfaces, sm, "manual", manual_params=mp)
                row[f"vol_{dv:+.0f}"] = r.total_pnl
            results.append(row)
        return pd.DataFrame(results)


# ─── JSON Export ───────────────────────────────────────────────────────────────

def pnl_result_to_dict(result: PnLResult) -> dict:
    """Convert PnLResult to a JSON-serializable dict for the frontend."""
    return {
        "total_pnl": result.total_pnl,
        "spot_move": result.spot_move,
        "vol_params": result.vol_params,
        "pnl_by_expiry": [
            {"expiry": k, "pnl": v, "bucket": classify_expiry(k)}
            for k, v in result.pnl_by_expiry.items()
        ],
        "pnl_by_bucket": [
            {"bucket": k, "pnl": v} for k, v in result.pnl_by_bucket.items()
        ],
        "pnl_by_moneyness": [
            {"moneyness": k, "pnl": v}
            for k, v in result.pnl_by_moneyness.items()
            if abs(v) > 1.0
        ],
        "vega_total": result.vega_grid.total,
        "pnl_grid": {
            "moneyness": result.vega_grid.moneyness.tolist(),
            "expiries": result.vega_grid.expiries,
            "values": result.pnl_grid.tolist(),
        },
        "vol_change_grid": {
            "moneyness": result.vega_grid.moneyness.tolist(),
            "expiries": result.vega_grid.expiries,
            "values": result.vol_change_grid.tolist(),
        },
    }


# ─── CLI Usage ─────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys

    data_dir = sys.argv[1] if len(sys.argv) > 1 else "../data/sample"
    prefix = sys.argv[2] if len(sys.argv) > 2 else "SPX"

    print(f"Loading surfaces from {data_dir} with prefix {prefix}...")
    surfaces = load_surfaces(data_dir, prefix)
    print(f"Loaded {len(surfaces)} surfaces: {list(surfaces.keys())}")

    for shift, grid in surfaces.items():
        print(f"  Shift {shift:+.1%}: {grid.n_strikes} strikes × {grid.n_expiries} expiries, total vega = {grid.total:,.0f}")

    # Run scenario matrix
    print("\n─── Beta Model Scenario Matrix ───")
    matrix = compute_scenario_matrix(surfaces, vol_mode="beta")
    print(matrix.to_string(index=False, float_format=lambda x: f"{x:,.0f}"))

    # Single scenario example
    print("\n─── Single Scenario: Spot -5% ───")
    result = compute_pnl(surfaces, spot_move=-0.05, vol_mode="beta")
    print(f"Total P&L: ${result.total_pnl:,.0f}")
    print(f"P&L by bucket:")
    for bucket, pnl in sorted(result.pnl_by_bucket.items()):
        print(f"  {bucket:>6s}: ${pnl:>12,.0f}")

    # Export JSON for frontend
    output = pnl_result_to_dict(result)
    with open("pnl_output.json", "w") as f:
        json.dump(output, f, indent=2)
    print(f"\nJSON exported to pnl_output.json")
