# Vega P&L Engine

Dynamic vega P&L prediction tool for equity index options portfolios.  
Upload daily vega surfaces (7 spot-shift scenarios) and project P&L under customizable vol models.

## Project Structure

```
vega-pnl-engine/
├── backend/                  # Python risk engine + API server
│   ├── vega_risk_engine.py   # Core math: interpolation, vol models, P&L
│   ├── server.py             # FastAPI server serving JSON to the dashboard
│   └── requirements.txt
├── frontend/                 # React dashboard (Vite)
│   ├── src/
│   │   ├── main.jsx
│   │   ├── App.jsx
│   │   ├── index.css
│   │   ├── engine/           # JS interpolation + vol engine (client-side)
│   │   │   ├── parser.js
│   │   │   ├── interpolation.js
│   │   │   ├── volModels.js
│   │   │   └── pnl.js
│   │   └── components/       # React UI components
│   │       ├── FileUpload.jsx
│   │       ├── Controls.jsx
│   │       ├── MetricCards.jsx
│   │       ├── Charts.jsx
│   │       └── HeatmapTable.jsx
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── data/sample/              # Drop your CSVs here
└── README.md
```

## Quick Start

### Option A: Frontend Only (recommended for daily use)
All computation runs client-side in the browser. No server needed.

```bash
cd frontend
npm install
npm run dev
```

Opens at http://localhost:3000. Drop your 7 CSV files into the upload zone.

### Option B: Python Backend + Frontend
Use when you want Python-side analytics, batch processing, or custom model calibration.

```bash
# Terminal 1: Backend
cd backend
pip install -r requirements.txt
python server.py
# API runs at http://localhost:8000

# Terminal 2: Frontend
cd frontend
npm install
npm run dev
# Dashboard at http://localhost:3000
```

### VS Code: Run Both Together
Use the VS Code task runner or just open two terminals in the integrated terminal.

## CSV File Naming Convention

Files must contain one of these identifiers in the filename:

| Identifier | Spot Shift |
|------------|-----------|
| `atm`      | 0%        |
| `up_25`    | +2.5%     |
| `up_50`    | +5.0%     |
| `up_75`    | +7.5%     |
| `down_25`  | -2.5%     |
| `down_50`  | -5.0%     |
| `down_75`  | -7.5%     |

Example: `SPX_atm.csv`, `SPX_down_75.csv`, `NDX_up_25.csv`

## CSV Format

- Row 0: Header — blank cell, then expiry dates, then "TOTAL"
- Rows 1–N: Moneyness (decimal, e.g. 1.0 = ATM strike), vega values per expiry, row total
- Last row: Blank moneyness, column totals

## Vol Models

### Beta Model (Default)
Calibrated spot-vol relationship:
```
Δσ(K,T) = [β·ΔS + γ·ΔS²] × exp(-τ·T) × [1 + κ·(K-1)]
```

| Parameter    | Default | Description                        |
|-------------|---------|-------------------------------------|
| Spot-Vol β  | -0.40   | ATM vol change per 1% spot move   |
| Skew β      | 0.15    | Extra vol for OTM strikes          |
| Term Decay  | 0.80    | Exponential decay across tenors    |
| Convexity   | 2.00    | Vol-of-vol on large moves          |

### Manual Mode
Direct inputs: ATM vol change (pts), skew shift, term multiplier.
