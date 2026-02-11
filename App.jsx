import { useState, useCallback, useMemo } from 'react';
import FileUpload from './components/FileUpload.jsx';
import { SpotControls, VolControls } from './components/Controls.jsx';
import MetricCards from './components/MetricCards.jsx';
import {
  PnLByExpiryChart, PnLByMoneynessChart, TotalVegaComparisonChart,
  ScenarioCurveChart, VolChangePreviewChart,
} from './components/Charts.jsx';
import HeatmapTable from './components/HeatmapTable.jsx';
import StressTestPanel from './components/StressTest.jsx';
import { interpolateVegaGrid } from './engine/interpolation.js';
import { computePnL } from './engine/pnl.js';
import { DEFAULT_BETA_PARAMS, DEFAULT_MANUAL_PARAMS, EXPIRY_BUCKET_ORDER } from './engine/volModels.js';
import { fmt, pnlColor, formatExpiryFull } from './utils/format.js';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'stress', label: 'Stress Test' },
  { key: 'expiry', label: 'By Expiry' },
  { key: 'moneyness', label: 'By Strike' },
  { key: 'scenario', label: 'Scenario Curve' },
  { key: 'heatmap', label: 'P&L Grid' },
  { key: 'surface', label: 'Vol Change' },
];

export default function App() {
  // ─── State ──────────────────────────────────────────────────────────
  const [loadedFiles, setLoadedFiles] = useState({});
  const [spotMove, setSpotMove] = useState(0);
  const [volMode, setVolMode] = useState('beta');
  const [betaParams, setBetaParams] = useState(DEFAULT_BETA_PARAMS);
  const [manualParams, setManualParams] = useState(DEFAULT_MANUAL_PARAMS);
  const [activeTab, setActiveTab] = useState('overview');

  // ─── Derived ────────────────────────────────────────────────────────

  // Build surfaces map: shift (number) -> parsed grid
  const surfaces = useMemo(() => {
    const s = {};
    Object.entries(loadedFiles).forEach(([key, { shift, data }]) => {
      s[shift] = data;
    });
    return s;
  }, [loadedFiles]);

  const hasSurfaces = Object.keys(surfaces).length > 0;

  // Interpolated grid at current spot move
  const currentGrid = useMemo(() => {
    if (!hasSurfaces) return null;
    return interpolateVegaGrid(surfaces, spotMove);
  }, [surfaces, spotMove, hasSurfaces]);

  const atmGrid = useMemo(() => surfaces[0] || null, [surfaces]);

  const volParams = volMode === 'beta' ? betaParams : manualParams;

  // P&L
  const pnlResult = useMemo(() => {
    if (!currentGrid) return null;
    return computePnL(currentGrid, spotMove, volParams, volMode);
  }, [currentGrid, spotMove, volParams, volMode]);

  // Vega totals
  const atmTotalVega = useMemo(() => {
    if (!atmGrid) return 0;
    return atmGrid.rows.reduce((acc, r) => acc + r.total, 0);
  }, [atmGrid]);

  const shiftedTotalVega = useMemo(() => {
    if (!currentGrid) return 0;
    return currentGrid.rows.reduce((acc, r) => acc + r.total, 0);
  }, [currentGrid]);

  const handleFilesLoaded = useCallback((results) => {
    setLoadedFiles((prev) => ({ ...prev, ...results }));
  }, []);

  // ─── Render ─────────────────────────────────────────────────────────
  return (
    <div style={{ background: 'var(--bg)', color: 'var(--text)', minHeight: '100vh' }}>
      {/* Header */}
      <header style={{
        borderBottom: '1px solid var(--border)', padding: '14px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 6,
            background: 'linear-gradient(135deg, #00d4aa, #1e90ff)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, fontWeight: 800, color: 'var(--bg)',
            fontFamily: 'var(--font-mono)',
          }}>
            V
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-bright)', letterSpacing: '-0.02em' }}>
              Vega P&L Engine
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 1 }}>
              Dynamic Risk Scenario Analysis
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{
            fontSize: 10, padding: '3px 10px', borderRadius: 20,
            background: hasSurfaces ? 'var(--green-dim)' : 'var(--red-dim)',
            color: hasSurfaces ? 'var(--green)' : 'var(--red)',
            fontWeight: 600,
          }}>
            {hasSurfaces ? `${Object.keys(surfaces).length} surfaces loaded` : 'No data'}
          </span>
        </div>
      </header>

      <div style={{ display: 'flex', minHeight: 'calc(100vh - 60px)' }}>
        {/* ─── Left Panel ──────────────────────────────────────────── */}
        <aside style={{
          width: 300, borderRight: '1px solid var(--border)',
          padding: 20, overflowY: 'auto', flexShrink: 0,
        }}>
          <div style={{ marginBottom: 24 }}>
            <div style={{
              fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase',
              letterSpacing: '0.08em', marginBottom: 10,
            }}>
              Data
            </div>
            <FileUpload onFilesLoaded={handleFilesLoaded} loadedFiles={loadedFiles} />
          </div>

          {hasSurfaces && (
            <>
              <SpotControls spotMove={spotMove} setSpotMove={setSpotMove} />
              <VolControls
                volMode={volMode} setVolMode={setVolMode}
                betaParams={betaParams} setBetaParams={setBetaParams}
                manualParams={manualParams} setManualParams={setManualParams}
              />
            </>
          )}
        </aside>

        {/* ─── Main Content ────────────────────────────────────────── */}
        <main style={{ flex: 1, padding: 20, overflowY: 'auto' }}>
          {!hasSurfaces ? (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              height: '100%', flexDirection: 'column', gap: 16,
            }}>
              <div style={{ fontSize: 48, opacity: 0.2 }}>◇</div>
              <div style={{ color: 'var(--text-dim)', fontSize: 14, textAlign: 'center', maxWidth: 420 }}>
                Upload your vega surface CSVs to begin analysis.
                <br />
                <span style={{ fontSize: 12, opacity: 0.7 }}>
                  Supports ATM, ±2.5%, ±5%, and ±7.5% spot shift surfaces.
                </span>
              </div>
            </div>
          ) : (
            <>
              {/* Metric Cards */}
              <MetricCards
                pnlResult={pnlResult}
                spotMove={spotMove}
                atmTotalVega={atmTotalVega}
                shiftedTotalVega={shiftedTotalVega}
                volMode={volMode}
                betaParams={betaParams}
                manualParams={manualParams}
              />

              {/* Tabs */}
              <div style={{
                display: 'flex', gap: 2, marginBottom: 20,
                borderBottom: '1px solid var(--border)',
              }}>
                {TABS.map(({ key, label }) => (
                  <button key={key} onClick={() => setActiveTab(key)} style={{
                    padding: '8px 16px', fontSize: 12,
                    fontWeight: activeTab === key ? 600 : 400,
                    color: activeTab === key ? 'var(--accent)' : 'var(--text-dim)',
                    background: 'transparent', border: 'none',
                    borderBottom: activeTab === key ? '2px solid var(--accent)' : '2px solid transparent',
                  }}>
                    {label}
                  </button>
                ))}
              </div>

              {/* Tab Content */}
              {activeTab === 'overview' && pnlResult && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <Panel title="P&L by Expiry Bucket">
                    <PnLByExpiryChart pnlByBucket={pnlResult.pnlByBucket} />
                  </Panel>
                  <Panel title="P&L by Moneyness">
                    <PnLByMoneynessChart pnlByMoneyness={pnlResult.pnlByMoneyness} />
                  </Panel>
                  <Panel title="Total Vega by Spot Shift">
                    <TotalVegaComparisonChart surfaces={surfaces} />
                  </Panel>
                  <Panel title="Projected Vol Changes by Tenor">
                    <VolChangePreviewChart
                      expiries={currentGrid?.expiries || []}
                      spotMove={spotMove}
                      volParams={volParams}
                      volMode={volMode}
                    />
                  </Panel>
                </div>
              )}

              {activeTab === 'stress' && (
                <StressTestPanel surfaces={surfaces} volParams={volParams} />
              )}

              {activeTab === 'expiry' && pnlResult && (
                <Panel title="P&L by Expiry">
                  <PnLByExpiryChart pnlByBucket={pnlResult.pnlByBucket} />
                  <ExpiryTable data={pnlResult.pnlByExpiry} />
                </Panel>
              )}

              {activeTab === 'moneyness' && pnlResult && (
                <Panel title="P&L by Strike/Moneyness">
                  <PnLByMoneynessChart pnlByMoneyness={pnlResult.pnlByMoneyness} />
                  <MoneynessTable data={pnlResult.pnlByMoneyness} />
                </Panel>
              )}

              {activeTab === 'scenario' && (
                <Panel title={`P&L across spot scenarios (${volMode === 'beta' ? 'Beta Model' : 'Manual Vol'})`}>
                  <ScenarioCurveChart surfaces={surfaces} volParams={volParams} volMode={volMode} />
                  {volMode === 'beta' && (
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 8, padding: '0 10px' }}>
                      At β={betaParams.spotVolBeta}, a 5% selloff implies ~{Math.abs(betaParams.spotVolBeta * 5).toFixed(1)} vol
                      points ATM rise (before convexity adjustment).
                    </div>
                  )}
                </Panel>
              )}

              {activeTab === 'heatmap' && pnlResult && currentGrid && (
                <Panel title={`P&L Grid — Spot ${spotMove >= 0 ? '+' : ''}${(spotMove * 100).toFixed(2)}%`}>
                  <HeatmapTable data={pnlResult.pnlRows} expiries={currentGrid.expiries} title="" />
                </Panel>
              )}

              {activeTab === 'surface' && currentGrid && (
                <div style={{ display: 'grid', gap: 16 }}>
                  <Panel title="Vol Change Term Structure (ATM, 90%, 110%)">
                    <VolChangePreviewChart
                      expiries={currentGrid.expiries}
                      spotMove={spotMove}
                      volParams={volParams}
                      volMode={volMode}
                    />
                  </Panel>
                  <Panel title="Interpolated Vega Surface">
                    <HeatmapTable data={currentGrid.rows} expiries={currentGrid.expiries} title="" />
                  </Panel>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

// ─── Small helper components ──────────────────────────────────────────────────

function Panel({ title, children }) {
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 8, padding: 16,
    }}>
      {title && (
        <div style={{
          fontSize: 12, color: 'var(--text-dim)', textTransform: 'uppercase',
          letterSpacing: '0.06em', marginBottom: 8,
        }}>
          {title}
        </div>
      )}
      {children}
    </div>
  );
}

function ExpiryTable({ data }) {
  return (
    <div style={{ marginTop: 16 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
        <thead>
          <tr>
            {['Expiry', 'Bucket', 'P&L'].map((h, i) => (
              <th key={h} style={{
                textAlign: i === 2 ? 'right' : 'left',
                padding: '8px 12px', color: 'var(--text-dim)',
                borderBottom: '1px solid var(--border)',
              }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map(({ expiry, pnl, bucket }) => (
            <tr key={expiry}>
              <td style={{ padding: '6px 12px', borderBottom: '1px solid rgba(26,34,54,0.4)', color: 'var(--text-bright)' }}>
                {formatExpiryFull(expiry)}
              </td>
              <td style={{ padding: '6px 12px', borderBottom: '1px solid rgba(26,34,54,0.4)', color: 'var(--text-dim)' }}>
                {bucket}
              </td>
              <td style={{
                padding: '6px 12px', borderBottom: '1px solid rgba(26,34,54,0.4)',
                color: pnlColor(pnl), textAlign: 'right', fontWeight: 600,
              }}>
                ${fmt(pnl)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MoneynessTable({ data }) {
  const filtered = data.filter((d) => Math.abs(d.pnl) > 1).sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl));
  return (
    <div style={{ marginTop: 16, maxHeight: 400, overflowY: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
        <thead>
          <tr>
            {['Moneyness', 'P&L'].map((h, i) => (
              <th key={h} style={{
                textAlign: i === 1 ? 'right' : 'left',
                padding: '8px 12px', color: 'var(--text-dim)',
                borderBottom: '1px solid var(--border)',
                position: 'sticky', top: 0, background: 'var(--bg-card)',
              }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filtered.map(({ moneyness, pnl }) => (
            <tr key={moneyness}>
              <td style={{ padding: '5px 12px', borderBottom: '1px solid rgba(26,34,54,0.4)', color: 'var(--text-bright)' }}>
                {(moneyness * 100).toFixed(1)}%
              </td>
              <td style={{
                padding: '5px 12px', borderBottom: '1px solid rgba(26,34,54,0.4)',
                color: pnlColor(pnl), textAlign: 'right', fontWeight: 600,
              }}>
                ${fmt(pnl)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
