import { useState, useMemo } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, Cell, ReferenceLine, Area, ComposedChart,
} from 'recharts';
import { STRESS_SCENARIOS, runStressScenario } from '../engine/volModels.js';
import { interpolateVegaGrid } from '../engine/interpolation.js';
import { fmt } from '../utils/format.js';

const tooltipStyle = {
  background: '#0f1420',
  border: '1px solid #1a2236',
  borderRadius: 6,
  fontSize: 12,
};

export default function StressTestPanel({ surfaces, volParams }) {
  const [selectedScenario, setSelectedScenario] = useState(null);
  const [compareMode, setCompareMode] = useState(false);
  const [selectedScenarios, setSelectedScenarios] = useState([]);

  // Run selected scenario
  const scenarioResult = useMemo(() => {
    if (!selectedScenario || !surfaces || Object.keys(surfaces).length === 0) return null;
    const scenario = STRESS_SCENARIOS[selectedScenario];
    if (!scenario) return null;
    return runStressScenario(surfaces, scenario, interpolateVegaGrid, volParams);
  }, [selectedScenario, surfaces, volParams]);

  // Run comparison scenarios
  const comparisonResults = useMemo(() => {
    if (!compareMode || selectedScenarios.length === 0 || Object.keys(surfaces).length === 0) return {};
    const results = {};
    for (const key of selectedScenarios) {
      const scenario = STRESS_SCENARIOS[key];
      if (scenario) {
        results[key] = runStressScenario(surfaces, scenario, interpolateVegaGrid, volParams);
      }
    }
    return results;
  }, [compareMode, selectedScenarios, surfaces, volParams]);

  const scenario = selectedScenario ? STRESS_SCENARIOS[selectedScenario] : null;

  const toggleComparison = (key) => {
    setSelectedScenarios(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  return (
    <div>
      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        <button
          onClick={() => setCompareMode(false)}
          style={{
            padding: '8px 16px', fontSize: 12, fontWeight: 600,
            background: !compareMode ? 'rgba(0,212,170,0.25)' : '#0f1420',
            color: !compareMode ? '#00d4aa' : '#5a6478',
            border: `1px solid ${!compareMode ? 'rgba(0,212,170,0.3)' : '#1a2236'}`,
            borderRadius: 5, cursor: 'pointer',
          }}
        >
          Single Scenario
        </button>
        <button
          onClick={() => setCompareMode(true)}
          style={{
            padding: '8px 16px', fontSize: 12, fontWeight: 600,
            background: compareMode ? 'rgba(0,212,170,0.25)' : '#0f1420',
            color: compareMode ? '#00d4aa' : '#5a6478',
            border: `1px solid ${compareMode ? 'rgba(0,212,170,0.3)' : '#1a2236'}`,
            borderRadius: 5, cursor: 'pointer',
          }}
        >
          Compare Scenarios
        </button>
      </div>

      {/* Scenario buttons */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8, marginBottom: 20 }}>
        {Object.entries(STRESS_SCENARIOS).map(([key, s]) => {
          const isSelected = compareMode ? selectedScenarios.includes(key) : selectedScenario === key;
          const maxDD = Math.min(...s.path.map(p => p[1])) * 100;
          const vixPeak = Math.max(...s.path.map(p => p[2]));
          return (
            <button
              key={key}
              onClick={() => compareMode ? toggleComparison(key) : setSelectedScenario(key)}
              style={{
                padding: '12px 14px', textAlign: 'left',
                background: isSelected ? `${s.color}15` : '#0f1420',
                border: `1px solid ${isSelected ? s.color + '60' : '#1a2236'}`,
                borderRadius: 6, cursor: 'pointer',
                borderLeft: `3px solid ${isSelected ? s.color : 'transparent'}`,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: isSelected ? s.color : '#e8ecf4', marginBottom: 4 }}>
                {s.name}
              </div>
              <div style={{ fontSize: 10, color: '#5a6478', lineHeight: 1.4 }}>
                {s.dates}
              </div>
              <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
                <span style={{ fontSize: 10, color: '#ff4757', fontFamily: "'JetBrains Mono', monospace" }}>
                  {maxDD.toFixed(1)}%
                </span>
                <span style={{ fontSize: 10, color: '#ffa502', fontFamily: "'JetBrains Mono', monospace" }}>
                  VIX {vixPeak}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Single Scenario View */}
      {!compareMode && scenarioResult && scenario && (
        <div>
          {/* Summary metrics */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <SummaryCard label="Peak P&L" value={'$' + fmt(Math.max(...scenarioResult.map(r => r.cumPnL)))}
              color={Math.max(...scenarioResult.map(r => r.cumPnL)) >= 0 ? '#00d4aa' : '#ff4757'} />
            <SummaryCard label="Trough P&L" value={'$' + fmt(Math.min(...scenarioResult.map(r => r.cumPnL)))}
              color={Math.min(...scenarioResult.map(r => r.cumPnL)) >= 0 ? '#00d4aa' : '#ff4757'} />
            <SummaryCard label="Final P&L" value={'$' + fmt(scenarioResult[scenarioResult.length - 1]?.cumPnL || 0)}
              color={(scenarioResult[scenarioResult.length - 1]?.cumPnL || 0) >= 0 ? '#00d4aa' : '#ff4757'} />
            <SummaryCard label="Max Daily Loss"
              value={'$' + fmt(Math.min(...scenarioResult.map(r => r.dailyPnL)))}
              color="#ff4757" />
            {scenarioResult.some(r => r.clamped) && (
              <SummaryCard label="⚠ Clamped" value="Beyond grid" color="#ffa502"
                sub="Spot moved beyond ±7.5% — results approximate" />
            )}
          </div>

          {/* Cumulative P&L + Spot path */}
          <div style={{ background: '#0f1420', border: '1px solid #1a2236', borderRadius: 8, padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: '#5a6478', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
              {scenario.name} — Cumulative P&L vs Spot Path
            </div>
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={scenarioResult} margin={{ top: 10, right: 60, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a2236" />
                <XAxis dataKey="day" tick={{ fill: '#5a6478', fontSize: 11 }}
                  label={{ value: 'Trading Day', position: 'insideBottom', offset: -2, fill: '#5a6478', fontSize: 11 }} />
                <YAxis yAxisId="pnl" tick={{ fill: '#5a6478', fontSize: 10 }}
                  tickFormatter={(v) => '$' + fmt(v)}
                  label={{ value: 'P&L ($)', angle: -90, position: 'insideLeft', fill: '#5a6478', fontSize: 10 }} />
                <YAxis yAxisId="spot" orientation="right" tick={{ fill: '#5a6478', fontSize: 10 }}
                  tickFormatter={(v) => v.toFixed(1) + '%'}
                  label={{ value: 'Spot (%)', angle: 90, position: 'insideRight', fill: '#5a6478', fontSize: 10 }} />
                <Tooltip contentStyle={tooltipStyle}
                  formatter={(v, name) => {
                    if (name === 'cumPnL') return ['$' + fmt(v, 0), 'Cum P&L'];
                    if (name === 'spotReturn') return [v.toFixed(1) + '%', 'Spot'];
                    if (name === 'vix') return [v.toFixed(0), 'VIX'];
                    return [v, name];
                  }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <ReferenceLine yAxisId="pnl" y={0} stroke="#5a6478" strokeDasharray="3 3" />
                <Area yAxisId="pnl" type="monotone" dataKey="cumPnL" name="cumPnL"
                  stroke={scenario.color} fill={scenario.color} fillOpacity={0.1} strokeWidth={2.5} />
                <Line yAxisId="spot" type="monotone" dataKey="spotReturn" name="spotReturn"
                  stroke="#5a6478" strokeWidth={1.5} strokeDasharray="5 5" dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Daily P&L waterfall */}
          <div style={{ background: '#0f1420', border: '1px solid #1a2236', borderRadius: 8, padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: '#5a6478', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
              Daily P&L Breakdown
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={scenarioResult.slice(1)} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a2236" />
                <XAxis dataKey="day" tick={{ fill: '#5a6478', fontSize: 11 }} />
                <YAxis tick={{ fill: '#5a6478', fontSize: 10 }} tickFormatter={(v) => '$' + fmt(v)} />
                <Tooltip contentStyle={tooltipStyle}
                  formatter={(v) => ['$' + fmt(v, 0), 'Daily P&L']}
                  labelFormatter={(v) => 'Day ' + v} />
                <ReferenceLine y={0} stroke="#5a6478" strokeDasharray="3 3" />
                <Bar dataKey="dailyPnL" radius={[3, 3, 0, 0]}>
                  {scenarioResult.slice(1).map((entry, i) => (
                    <Cell key={i} fill={entry.dailyPnL >= 0 ? '#00d4aa' : '#ff4757'} fillOpacity={0.8} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Detail table */}
          <div style={{ background: '#0f1420', border: '1px solid #1a2236', borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: 12, color: '#5a6478', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
              Day-by-Day Detail
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>
                <thead>
                  <tr>
                    {['Day', 'Spot', 'VIX', 'ΔVIX', 'Daily P&L', 'Cum P&L'].map((h, i) => (
                      <th key={h} style={{
                        textAlign: i >= 3 ? 'right' : 'left', padding: '6px 10px',
                        color: '#5a6478', borderBottom: '1px solid #1a2236',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {scenarioResult.map((r, i) => (
                    <tr key={i} style={{ background: r.clamped ? 'rgba(255,165,2,0.05)' : 'transparent' }}>
                      <td style={{ padding: '5px 10px', borderBottom: '1px solid #1a223620', color: '#e8ecf4' }}>
                        {r.day}{r.clamped ? ' ⚠' : ''}
                      </td>
                      <td style={{ padding: '5px 10px', borderBottom: '1px solid #1a223620', color: r.spotReturn < 0 ? '#ff4757' : '#00d4aa' }}>
                        {r.spotReturn.toFixed(1)}%
                      </td>
                      <td style={{ padding: '5px 10px', borderBottom: '1px solid #1a223620', color: '#ffa502' }}>
                        {r.vix.toFixed(1)}
                      </td>
                      <td style={{ padding: '5px 10px', borderBottom: '1px solid #1a223620', textAlign: 'right',
                        color: (r.dailyVixChange || 0) > 0 ? '#ff4757' : '#00d4aa' }}>
                        {r.dailyVixChange ? (r.dailyVixChange > 0 ? '+' : '') + r.dailyVixChange.toFixed(1) : '—'}
                      </td>
                      <td style={{ padding: '5px 10px', borderBottom: '1px solid #1a223620', textAlign: 'right',
                        color: r.dailyPnL >= 0 ? '#00d4aa' : '#ff4757', fontWeight: 600 }}>
                        ${fmt(r.dailyPnL)}
                      </td>
                      <td style={{ padding: '5px 10px', borderBottom: '1px solid #1a223620', textAlign: 'right',
                        color: r.cumPnL >= 0 ? '#00d4aa' : '#ff4757', fontWeight: 600 }}>
                        ${fmt(r.cumPnL)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Scenario description */}
          <div style={{ marginTop: 12, fontSize: 11, color: '#5a6478', padding: '0 4px', lineHeight: 1.5 }}>
            {scenario.description}
            {scenarioResult.some(r => r.clamped) && (
              <span style={{ color: '#ffa502' }}>
                {' '}Note: spot moved beyond the ±7.5% grid range — P&L is clamped at the boundary and may understate true exposure. Upload wider-range surfaces for more accurate stress testing.
              </span>
            )}
          </div>
        </div>
      )}

      {/* Comparison View */}
      {compareMode && Object.keys(comparisonResults).length > 0 && (
        <div>
          {/* Overlay chart */}
          <div style={{ background: '#0f1420', border: '1px solid #1a2236', borderRadius: 8, padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: '#5a6478', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
              Cumulative P&L Comparison
            </div>
            <ComparisonChart results={comparisonResults} />
          </div>

          {/* Summary table */}
          <div style={{ background: '#0f1420', border: '1px solid #1a2236', borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: 12, color: '#5a6478', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
              Scenario Summary
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>
              <thead>
                <tr>
                  {['Scenario', 'Peak P&L', 'Trough P&L', 'Final P&L', 'Max Daily Loss'].map((h, i) => (
                    <th key={h} style={{
                      textAlign: i === 0 ? 'left' : 'right', padding: '8px 10px',
                      color: '#5a6478', borderBottom: '1px solid #1a2236',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(comparisonResults).map(([key, data]) => {
                  const s = STRESS_SCENARIOS[key];
                  const peak = Math.max(...data.map(r => r.cumPnL));
                  const trough = Math.min(...data.map(r => r.cumPnL));
                  const final_ = data[data.length - 1]?.cumPnL || 0;
                  const maxLoss = Math.min(...data.map(r => r.dailyPnL));
                  return (
                    <tr key={key}>
                      <td style={{ padding: '6px 10px', borderBottom: '1px solid #1a223620', color: s.color, fontWeight: 600 }}>
                        {s.name}
                      </td>
                      <td style={{ padding: '6px 10px', borderBottom: '1px solid #1a223620', textAlign: 'right',
                        color: peak >= 0 ? '#00d4aa' : '#ff4757' }}>
                        ${fmt(peak)}
                      </td>
                      <td style={{ padding: '6px 10px', borderBottom: '1px solid #1a223620', textAlign: 'right',
                        color: trough >= 0 ? '#00d4aa' : '#ff4757' }}>
                        ${fmt(trough)}
                      </td>
                      <td style={{ padding: '6px 10px', borderBottom: '1px solid #1a223620', textAlign: 'right',
                        color: final_ >= 0 ? '#00d4aa' : '#ff4757', fontWeight: 600 }}>
                        ${fmt(final_)}
                      </td>
                      <td style={{ padding: '6px 10px', borderBottom: '1px solid #1a223620', textAlign: 'right', color: '#ff4757' }}>
                        ${fmt(maxLoss)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!compareMode && !scenarioResult && (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#5a6478' }}>
          Select a historical scenario above to replay through your portfolio.
        </div>
      )}
      {compareMode && selectedScenarios.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#5a6478' }}>
          Select multiple scenarios above to compare P&L paths.
        </div>
      )}
    </div>
  );
}

// ─── Helper Components ───────────────────────────────────────────────────────

function SummaryCard({ label, value, color, sub }) {
  return (
    <div style={{
      background: '#0f1420', border: '1px solid #1a2236', borderRadius: 6,
      padding: '12px 16px', minWidth: 140, flex: 1,
    }}>
      <div style={{ fontSize: 10, color: '#5a6478', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color, fontFamily: "'JetBrains Mono', monospace" }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 9, color: '#5a6478', marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function ComparisonChart({ results }) {
  // Normalize all series to same x-axis (day)
  const maxDays = Math.max(...Object.values(results).map(r => r.length));
  const data = [];
  for (let d = 0; d < maxDays; d++) {
    const point = { day: d };
    for (const [key, series] of Object.entries(results)) {
      point[key] = series[d]?.cumPnL || series[series.length - 1]?.cumPnL || 0;
    }
    data.push(point);
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1a2236" />
        <XAxis dataKey="day" tick={{ fill: '#5a6478', fontSize: 11 }}
          label={{ value: 'Trading Day', position: 'insideBottom', offset: -2, fill: '#5a6478', fontSize: 11 }} />
        <YAxis tick={{ fill: '#5a6478', fontSize: 10 }} tickFormatter={(v) => '$' + fmt(v)} />
        <Tooltip contentStyle={tooltipStyle}
          formatter={(v, name) => ['$' + fmt(v, 0), STRESS_SCENARIOS[name]?.name || name]} />
        <Legend wrapperStyle={{ fontSize: 11 }}
          formatter={(value) => STRESS_SCENARIOS[value]?.name || value} />
        <ReferenceLine y={0} stroke="#5a6478" strokeDasharray="3 3" />
        {Object.keys(results).map((key) => (
          <Line key={key} type="monotone" dataKey={key}
            stroke={STRESS_SCENARIOS[key]?.color || '#00d4aa'}
            strokeWidth={2} dot={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
