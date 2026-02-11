import { useMemo } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts';
import { fmt, pnlColor } from '../utils/format.js';
import { EXPIRY_BUCKET_ORDER, computeVolChange, yearsToExpiry } from '../engine/volModels.js';
import { interpolateVegaGrid } from '../engine/interpolation.js';
import { computePnL } from '../engine/pnl.js';

const tooltipStyle = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  fontSize: 12,
};

// ─── P&L by Expiry Bucket ────────────────────────────────────────────────────

export function PnLByExpiryChart({ pnlByBucket }) {
  const data = EXPIRY_BUCKET_ORDER.map((b) => ({
    bucket: b,
    pnl: pnlByBucket[b] || 0,
  }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="bucket" tick={{ fill: 'var(--text-dim)', fontSize: 11 }} />
        <YAxis tick={{ fill: 'var(--text-dim)', fontSize: 10 }} tickFormatter={(v) => fmt(v)} />
        <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: 'var(--text-bright)' }}
          formatter={(v) => ['$' + fmt(v, 0), 'P&L']} />
        <ReferenceLine y={0} stroke="var(--text-dim)" strokeDasharray="3 3" />
        <Bar dataKey="pnl" radius={[3, 3, 0, 0]}>
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.pnl >= 0 ? '#00d4aa' : '#ff4757'} fillOpacity={0.8} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── P&L by Moneyness ────────────────────────────────────────────────────────

export function PnLByMoneynessChart({ pnlByMoneyness }) {
  const filtered = pnlByMoneyness.filter(
    (d) => Math.abs(d.pnl) > 100 && d.moneyness > 0.2 && d.moneyness < 2.0
  );

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={filtered} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="moneyness" tick={{ fill: 'var(--text-dim)', fontSize: 10 }}
          tickFormatter={(v) => (v * 100).toFixed(0) + '%'} />
        <YAxis tick={{ fill: 'var(--text-dim)', fontSize: 10 }} tickFormatter={(v) => fmt(v)} />
        <Tooltip contentStyle={tooltipStyle}
          formatter={(v) => ['$' + fmt(v, 0), 'P&L']}
          labelFormatter={(v) => 'Moneyness: ' + (v * 100).toFixed(1) + '%'} />
        <ReferenceLine y={0} stroke="var(--text-dim)" strokeDasharray="3 3" />
        <Bar dataKey="pnl" radius={[3, 3, 0, 0]}>
          {filtered.map((entry, i) => (
            <Cell key={i} fill={entry.pnl >= 0 ? '#00d4aa' : '#ff4757'} fillOpacity={0.8} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Total Vega Comparison across Shifts ──────────────────────────────────────

export function TotalVegaComparisonChart({ surfaces }) {
  const data = useMemo(() => {
    return Object.entries(surfaces)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([shift, grid]) => {
        const totalVega = grid.rows.reduce((acc, row) => acc + row.total, 0);
        return { shift: (Number(shift) * 100).toFixed(1) + '%', totalVega };
      });
  }, [surfaces]);

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="shift" tick={{ fill: 'var(--text-dim)', fontSize: 11 }} />
        <YAxis tick={{ fill: 'var(--text-dim)', fontSize: 10 }} tickFormatter={(v) => fmt(v)} />
        <Tooltip contentStyle={tooltipStyle}
          formatter={(v) => ['$' + fmt(v, 0), 'Total Vega']} />
        <Bar dataKey="totalVega" radius={[3, 3, 0, 0]}>
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.totalVega >= 0 ? '#1e90ff' : '#ffa502'} fillOpacity={0.7} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Scenario P&L Curve ──────────────────────────────────────────────────────

export function ScenarioCurveChart({ surfaces, volParams, volMode }) {
  const data = useMemo(() => {
    const results = [];
    for (let s = -0.075; s <= 0.0751; s += 0.005) {
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
  }, [surfaces, volParams, volMode]);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="spotPct" tick={{ fill: 'var(--text-dim)', fontSize: 10 }}
          label={{ value: 'Spot Move (%)', position: 'insideBottom', offset: -2, fill: 'var(--text-dim)', fontSize: 11 }} />
        <YAxis tick={{ fill: 'var(--text-dim)', fontSize: 10 }} tickFormatter={(v) => fmt(v)} />
        <Tooltip contentStyle={tooltipStyle}
          formatter={(v) => ['$' + fmt(v, 0), 'Total P&L']}
          labelFormatter={(v) => 'Spot: ' + v + '%'} />
        <ReferenceLine y={0} stroke="var(--text-dim)" strokeDasharray="3 3" />
        <ReferenceLine x="0.0" stroke="#00d4aa" strokeDasharray="5 5" strokeOpacity={0.5} />
        <Line type="monotone" dataKey="pnl" stroke="#00d4aa" strokeWidth={2.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── Vol Change Term Structure Preview ───────────────────────────────────────

export function VolChangePreviewChart({ expiries, spotMove, volParams, volMode }) {
  const data = useMemo(() => {
    return expiries.map((exp) => {
      const d = new Date(exp);
      return {
        expiry: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        atm: computeVolChange(1.0, exp, spotMove, volParams, volMode).dSigma,
        '90%': computeVolChange(0.9, exp, spotMove, volParams, volMode).dSigma,
        '110%': computeVolChange(1.1, exp, spotMove, volParams, volMode).dSigma,
      };
    });
  }, [expiries, spotMove, volParams, volMode]);

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="expiry" tick={{ fill: 'var(--text-dim)', fontSize: 9 }} interval="preserveStartEnd" />
        <YAxis tick={{ fill: 'var(--text-dim)', fontSize: 10 }} tickFormatter={(v) => v.toFixed(1)}
          label={{ value: 'Δσ (vol pts)', angle: -90, position: 'insideLeft', fill: 'var(--text-dim)', fontSize: 10 }} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v) => [v.toFixed(2) + ' pts', '']} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Line type="monotone" dataKey="90%" stroke="#ff4757" strokeWidth={1.5} dot={false} />
        <Line type="monotone" dataKey="atm" stroke="#00d4aa" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="110%" stroke="#1e90ff" strokeWidth={1.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
