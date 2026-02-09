/**
 * Formatting utilities for the dashboard.
 */

export function fmt(n, decimals = 0) {
  if (n === undefined || n === null || isNaN(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e6) return (n / 1e6).toFixed(decimals + 1) + 'M';
  if (abs >= 1e3) return (n / 1e3).toFixed(decimals) + 'K';
  return n.toFixed(decimals);
}

export function fmtPct(n) {
  return (n * 100).toFixed(1) + '%';
}

export function pnlColor(v) {
  if (v > 0) return 'var(--green)';
  if (v < 0) return 'var(--red)';
  return 'var(--text-dim)';
}

export function formatExpiry(expiryStr) {
  const d = new Date(expiryStr);
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

export function formatExpiryFull(expiryStr) {
  const d = new Date(expiryStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
