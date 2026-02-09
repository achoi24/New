import { fmt, pnlColor, formatExpiry } from '../utils/format.js';

export default function HeatmapTable({ data, expiries, title }) {
  if (!data || data.length === 0) return null;

  // Compute color scale
  const allVals = data.flatMap((r) => r.values.filter((v) => v !== 0));
  const maxAbs = Math.max(...allVals.map(Math.abs), 1);

  const cellColor = (v) => {
    const intensity = Math.min(Math.abs(v) / maxAbs, 1);
    if (v > 0) return `rgba(0, 212, 170, ${intensity * 0.6})`;
    if (v < 0) return `rgba(255, 71, 87, ${intensity * 0.6})`;
    return 'transparent';
  };

  // Filter to active expiries and rows
  const activeExpiries = expiries
    .map((e, i) => ({ expiry: e, idx: i }))
    .filter(({ idx }) => data.some((r) => Math.abs(r.values[idx]) > 0.01));

  const activeRows = data.filter((r) => r.values.some((v) => Math.abs(v) > 0.01));
  if (activeRows.length === 0) return null;

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{
        fontSize: 12, color: 'var(--text-dim)', textTransform: 'uppercase',
        letterSpacing: '0.06em', marginBottom: 8,
      }}>
        {title}
      </div>
      <div style={{ overflowX: 'auto', maxHeight: 420 }}>
        <table style={{
          borderCollapse: 'collapse', fontSize: 10, fontFamily: 'var(--font-mono)', width: '100%',
        }}>
          <thead>
            <tr>
              <th style={{
                position: 'sticky', left: 0, background: 'var(--bg-card)',
                padding: '4px 8px', color: 'var(--text-dim)',
                borderBottom: '1px solid var(--border)', textAlign: 'left', zIndex: 2,
              }}>
                K/S
              </th>
              {activeExpiries.map(({ expiry }) => (
                <th key={expiry} style={{
                  padding: '4px 6px', color: 'var(--text-dim)',
                  borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
                }}>
                  {formatExpiry(expiry)}
                </th>
              ))}
              <th style={{
                padding: '4px 8px', color: 'var(--accent)',
                borderBottom: '1px solid var(--border)', fontWeight: 700,
              }}>
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {activeRows.map((row, ri) => (
              <tr key={ri}>
                <td style={{
                  position: 'sticky', left: 0, background: 'var(--bg-card)',
                  padding: '3px 8px', color: 'var(--text-bright)',
                  borderBottom: '1px solid rgba(26,34,54,0.4)', fontWeight: 600, zIndex: 1,
                }}>
                  {(row.moneyness * 100).toFixed(1)}%
                </td>
                {activeExpiries.map(({ expiry, idx }) => (
                  <td key={expiry} style={{
                    padding: '3px 6px', textAlign: 'right',
                    background: cellColor(row.values[idx]),
                    color: 'var(--text-bright)',
                    borderBottom: '1px solid rgba(26,34,54,0.4)',
                  }}>
                    {fmt(row.values[idx])}
                  </td>
                ))}
                <td style={{
                  padding: '3px 8px', textAlign: 'right',
                  color: pnlColor(row.total), fontWeight: 700,
                  borderBottom: '1px solid rgba(26,34,54,0.4)',
                }}>
                  {fmt(row.total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
