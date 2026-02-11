import { DEFAULT_BETA_PARAMS, DEFAULT_MANUAL_PARAMS } from '../engine/volModels.js';

export function SliderControl({ label, value, onChange, min, max, step, format, tooltip }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {label}
        </span>
        <span style={{ fontSize: 13, color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
          {format ? format(value) : value}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: '100%' }}
      />
      {tooltip && (
        <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2, opacity: 0.7 }}>
          {tooltip}
        </div>
      )}
    </div>
  );
}

export function SpotControls({ spotMove, setSpotMove }) {
  const presets = [-0.075, -0.05, -0.025, 0, 0.025, 0.05, 0.075];
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
        Spot Scenario
      </div>
      <SliderControl
        label="Spot Move"
        value={spotMove}
        onChange={setSpotMove}
        min={-0.075}
        max={0.075}
        step={0.0025}
        format={(v) => (v >= 0 ? '+' : '') + (v * 100).toFixed(2) + '%'}
      />
      <div style={{ display: 'flex', gap: 3, marginTop: 4 }}>
        {presets.map((v) => (
          <button
            key={v}
            onClick={() => setSpotMove(v)}
            style={{
              flex: 1,
              padding: '4px 0',
              fontSize: 9,
              background: Math.abs(spotMove - v) < 0.001 ? 'var(--accent-dim)' : 'var(--bg-card)',
              color: Math.abs(spotMove - v) < 0.001 ? 'var(--accent)' : 'var(--text-dim)',
              border: `1px solid ${Math.abs(spotMove - v) < 0.001 ? 'rgba(0,212,170,0.3)' : 'var(--border)'}`,
              borderRadius: 3,
              fontFamily: 'var(--font-mono)',
            }}
          >
            {v === 0 ? 'ATM' : (v > 0 ? '+' : '') + (v * 100).toFixed(1)}
          </button>
        ))}
      </div>
    </div>
  );
}

export function VolControls({ volMode, setVolMode, betaParams, setBetaParams, manualParams, setManualParams }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
        Vol Model
      </div>

      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
        {[{ key: 'beta', label: 'Beta Model' }, { key: 'manual', label: 'Manual' }].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setVolMode(key)}
            style={{
              flex: 1,
              padding: '8px 0',
              fontSize: 12,
              fontWeight: 600,
              background: volMode === key ? 'var(--accent-dim)' : 'var(--bg-card)',
              color: volMode === key ? 'var(--accent)' : 'var(--text-dim)',
              border: `1px solid ${volMode === key ? 'rgba(0,212,170,0.3)' : 'var(--border)'}`,
              borderRadius: 5,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {volMode === 'beta' ? (
        <>
          <SliderControl
            label="Spot-Vol β"
            value={betaParams.spotVolBeta}
            onChange={(v) => setBetaParams((p) => ({ ...p, spotVolBeta: v }))}
            min={-1.0} max={0} step={0.01}
            format={(v) => v.toFixed(2)}
            tooltip="ATM vol change per 1% spot move"
          />
          <SliderControl
            label="Skew β"
            value={betaParams.skewBeta}
            onChange={(v) => setBetaParams((p) => ({ ...p, skewBeta: v }))}
            min={0} max={1.0} step={0.01}
            format={(v) => v.toFixed(2)}
            tooltip="Additional vol for OTM strikes"
          />
          <SliderControl
            label="Term Decay"
            value={betaParams.termDecay}
            onChange={(v) => setBetaParams((p) => ({ ...p, termDecay: v }))}
            min={0} max={3.0} step={0.05}
            format={(v) => v.toFixed(2)}
            tooltip="Exponential decay across term structure"
          />
          <SliderControl
            label="Convexity"
            value={betaParams.convexity}
            onChange={(v) => setBetaParams((p) => ({ ...p, convexity: v }))}
            min={0} max={5.0} step={0.1}
            format={(v) => v.toFixed(1)}
            tooltip="Vol-of-vol: β increases for larger moves"
          />
          <SliderControl
            label="Volga Scale"
            value={betaParams.volgaScale}
            onChange={(v) => setBetaParams((p) => ({ ...p, volgaScale: v }))}
            min={0} max={1.0} step={0.01}
            format={(v) => v.toFixed(2)}
            tooltip="Second-order vol P&L: ½·Volga·(Δσ)²"
          />
          <SliderControl
            label="Term Floor"
            value={betaParams.termFloor}
            onChange={(v) => setBetaParams((p) => ({ ...p, termFloor: v }))}
            min={0} max={0.5} step={0.01}
            format={(v) => (v * 100).toFixed(0) + '%'}
            tooltip="Minimum term factor for long-dated expiries"
          />
          <button
            onClick={() => setBetaParams(DEFAULT_BETA_PARAMS)}
            style={{
              width: '100%',
              padding: '6px 0',
              fontSize: 11,
              background: 'transparent',
              color: 'var(--text-dim)',
              border: '1px solid var(--border)',
              borderRadius: 4,
              marginTop: 4,
            }}
          >
            Reset to Defaults
          </button>
        </>
      ) : (
        <>
          <SliderControl
            label="ATM Vol Change"
            value={manualParams.atmVolChange}
            onChange={(v) => setManualParams((p) => ({ ...p, atmVolChange: v }))}
            min={-10} max={10} step={0.25}
            format={(v) => (v >= 0 ? '+' : '') + v.toFixed(2) + ' pts'}
          />
          <SliderControl
            label="Skew Shift"
            value={manualParams.skewChange}
            onChange={(v) => setManualParams((p) => ({ ...p, skewChange: v }))}
            min={-1.0} max={1.0} step={0.01}
            format={(v) => v.toFixed(2)}
            tooltip="Vol per unit moneyness deviation"
          />
          <SliderControl
            label="Term Multiplier"
            value={manualParams.termMultiplier}
            onChange={(v) => setManualParams((p) => ({ ...p, termMultiplier: v }))}
            min={0} max={3.0} step={0.05}
            format={(v) => v.toFixed(2)}
            tooltip="Dampens vol change for longer tenors"
          />
          <SliderControl
            label="Volga Scale"
            value={manualParams.volgaScale}
            onChange={(v) => setManualParams((p) => ({ ...p, volgaScale: v }))}
            min={0} max={1.0} step={0.01}
            format={(v) => v.toFixed(2)}
            tooltip="Second-order vol P&L: ½·Volga·(Δσ)²"
          />
          <button
            onClick={() => setManualParams(DEFAULT_MANUAL_PARAMS)}
            style={{
              width: '100%', padding: '6px 0', fontSize: 11,
              background: 'transparent', color: 'var(--text-dim)',
              border: '1px solid var(--border)', borderRadius: 4, marginTop: 4,
            }}
          >
            Reset to Defaults
          </button>
        </>
      )}
    </div>
  );
}
