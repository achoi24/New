"""
FastAPI server for Vega P&L Engine.

Provides REST endpoints for the React dashboard to call when Python-side computation
is preferred (batch processing, model calibration, heavier analytics).

Usage:
    python server.py                          # default: load from ../data/sample
    python server.py --data-dir /path/to/csvs # custom data directory
    python server.py --prefix NDX             # non-SPX index
"""

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, List, Optional
import uvicorn
import tempfile
import os
import argparse

from vega_risk_engine import (
    VegaGrid, BetaParams, ManualParams,
    parse_csv, load_surfaces, detect_shift_from_filename,
    compute_pnl, compute_scenario_matrix,
    pnl_result_to_dict,
)

app = FastAPI(title="Vega P&L Engine API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── State ─────────────────────────────────────────────────────────────────────
# In-memory surface store. Refreshed on upload or server start.
surfaces: Dict[float, VegaGrid] = {}


# ─── Models ────────────────────────────────────────────────────────────────────

class BetaParamsInput(BaseModel):
    spot_vol_beta: float = -0.40
    skew_beta: float = 0.15
    term_decay: float = 0.80
    convexity: float = 2.0


class ManualParamsInput(BaseModel):
    atm_vol_change: float = 0.0
    skew_change: float = 0.1
    term_multiplier: float = 0.5


class PnLRequest(BaseModel):
    spot_move: float = 0.0
    vol_mode: str = "beta"
    beta_params: Optional[BetaParamsInput] = None
    manual_params: Optional[ManualParamsInput] = None
    interp_method: str = "linear"


class ScenarioMatrixRequest(BaseModel):
    vol_mode: str = "beta"
    beta_params: Optional[BetaParamsInput] = None
    manual_params: Optional[ManualParamsInput] = None
    spot_moves: Optional[List[float]] = None


# ─── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {
        "status": "ok",
        "surfaces_loaded": len(surfaces),
        "shifts": sorted(surfaces.keys()),
    }


@app.get("/surfaces")
def get_surfaces_summary():
    """Summary of loaded vega surfaces."""
    return {
        shift: {
            "n_strikes": grid.n_strikes,
            "n_expiries": grid.n_expiries,
            "total_vega": grid.total,
            "expiries": grid.expiries,
            "moneyness_range": [float(grid.moneyness.min()), float(grid.moneyness.max())],
        }
        for shift, grid in sorted(surfaces.items())
    }


@app.post("/upload")
async def upload_surfaces(files: List[UploadFile] = File(...)):
    """Upload CSV files to refresh the surface set."""
    global surfaces
    loaded = {}

    for file in files:
        shift = detect_shift_from_filename(file.filename)
        if shift is None:
            continue

        # Write to temp file, parse, clean up
        with tempfile.NamedTemporaryFile(delete=False, suffix=".csv") as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name

        try:
            grid = parse_csv(tmp_path, spot_shift=shift)
            loaded[shift] = grid
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Error parsing {file.filename}: {str(e)}")
        finally:
            os.unlink(tmp_path)

    surfaces.update(loaded)

    return {
        "uploaded": len(loaded),
        "total_surfaces": len(surfaces),
        "shifts": sorted(surfaces.keys()),
    }


@app.post("/pnl")
def compute_pnl_endpoint(req: PnLRequest):
    """Compute P&L for a single scenario."""
    if len(surfaces) == 0:
        raise HTTPException(status_code=400, detail="No surfaces loaded. Upload CSVs first.")

    bp = BetaParams(**req.beta_params.dict()) if req.beta_params else BetaParams()
    mp = ManualParams(**req.manual_params.dict()) if req.manual_params else ManualParams()

    result = compute_pnl(
        surfaces,
        spot_move=req.spot_move,
        vol_mode=req.vol_mode,
        beta_params=bp,
        manual_params=mp,
        interp_method=req.interp_method,
    )

    return pnl_result_to_dict(result)


@app.post("/scenario-matrix")
def scenario_matrix_endpoint(req: ScenarioMatrixRequest):
    """Compute P&L across a grid of spot scenarios."""
    if len(surfaces) == 0:
        raise HTTPException(status_code=400, detail="No surfaces loaded.")

    bp = BetaParams(**req.beta_params.dict()) if req.beta_params else BetaParams()
    mp = ManualParams(**req.manual_params.dict()) if req.manual_params else ManualParams()

    df = compute_scenario_matrix(
        surfaces,
        spot_moves=req.spot_moves,
        vol_mode=req.vol_mode,
        beta_params=bp,
        manual_params=mp,
    )

    return df.to_dict(orient="records")


@app.post("/clear")
def clear_surfaces():
    """Clear all loaded surfaces (for daily refresh)."""
    global surfaces
    surfaces = {}
    return {"status": "cleared"}


# ─── Startup ───────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Vega P&L Engine API Server")
    parser.add_argument("--data-dir", default="../data/sample", help="Directory with CSV surfaces")
    parser.add_argument("--prefix", default="SPX", help="Filename prefix to match")
    parser.add_argument("--port", type=int, default=8000, help="Server port")
    parser.add_argument("--host", default="0.0.0.0", help="Server host")
    args = parser.parse_args()

    # Pre-load surfaces if directory exists
    global surfaces
    if os.path.isdir(args.data_dir):
        surfaces = load_surfaces(args.data_dir, args.prefix)
        print(f"Pre-loaded {len(surfaces)} surfaces from {args.data_dir}")
        for shift, grid in sorted(surfaces.items()):
            print(f"  {shift:+.1%}: {grid.n_strikes}×{grid.n_expiries}, total vega={grid.total:,.0f}")
    else:
        print(f"Data directory {args.data_dir} not found — start with /upload endpoint")

    uvicorn.run(app, host=args.host, port=args.port)


if __name__ == "__main__":
    main()
