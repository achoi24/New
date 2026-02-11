import { fmt, pnlColor } from '../utils/format.js';

export default function MetricCards({ pnlResult, spotMove, atmTotalVega, shiftedTotalVega, volMode, betaParams, manualParams }) {
  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
      <Card
        label="Projected P&L"
        value={'$' + fmt(pnlResult?.totalPnL || 0)}
        color={pnlColor(pnlResult?.totalPnL || 0)}
        sub={`Spot ${spotMove >= 0 ? '+' : ''}${(spotMove * 100).toFixed(2)}%`}
      />
      <Card
        label="ATM Total Vega"
        value={'$' + fmt(atmTotalVega)}
        color="var(--blue)"
      />
      <Card
        label="Shifted Total Vega"
        value={'$' + fmt(shiftedTotalVega)}
        color="var(--purple)"
        sub={'Δ ' + fmt(shiftedTotalVega - atmTotalVega)}
      />
      <Card
        label="Vol Scenario"
        value={
          volMode === 'beta'
            ? `β=${betaParams.spotVolBeta}`
            : `${manualParams.atmVolChange >= 0 ? '+' : ''}${manualParams.atmVolChange}pts`
        }
        color="var(--orange)"
        sub={volMode === 'beta' ? 'Calibrated Model' : 'Manual Input'}
      />
      {pnlResult?.volgaContribution != null && Math.abs(pnlResult.volgaContribution) > 0.01 && (
        <Card
          label="Volga P&L"
          value={'$' + fmt(pnlResult.volgaContribution)}
          color={pnlColor(pnlResult.volgaContribution)}
          sub="½·Volga·(Δσ)² contribution"
        />
      )}
    </div>
  );
}

function Card({ label, value, sub, color }) {
  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        padding: '14px 18px',
        flex: 1,
        minWidth: 155,
      }}
    >
      <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: color || 'var(--text-bright)', fontFamily: 'var(--font-mono)' }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}
