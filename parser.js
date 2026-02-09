/**
 * CSV Parser for vega surface files.
 *
 * Expected format:
 * - Row 0: blank, expiry1, expiry2, ..., TOTAL
 * - Rows 1-N: moneyness, vega values, row total
 * - Last row: blank moneyness, column totals, grand total
 */

export const FILE_SHIFT_MAP = {
  down_75: -0.075,
  down_50: -0.05,
  down_25: -0.025,
  atm: 0.0,
  up_25: 0.025,
  up_50: 0.05,
  up_75: 0.075,
};

export const SHIFT_LABELS = Object.fromEntries(
  Object.entries(FILE_SHIFT_MAP).map(([k, v]) => [v, k])
);

export function detectShiftFromFilename(filename) {
  const name = filename.toLowerCase().replace('.csv', '');
  for (const [key, shift] of Object.entries(FILE_SHIFT_MAP)) {
    if (name.includes(key)) return { key, shift };
  }
  return null;
}

export function parseCSV(text) {
  const lines = text.trim().split('\n');
  const header = lines[0].split(',');

  // Expiry columns: skip first (moneyness) and last (TOTAL)
  const expiries = header.slice(1, -1).map(d => d.trim());

  const rows = [];
  let totalRow = null;

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const moneyness = cols[0].trim();
    const values = cols.slice(1, -1).map(Number);
    const total = Number(cols[cols.length - 1]);

    if (moneyness === '') {
      totalRow = { values, total };
    } else {
      rows.push({
        moneyness: parseFloat(moneyness),
        values,
        total,
      });
    }
  }

  return { expiries, rows, totalRow };
}

export async function processFiles(fileList) {
  const results = {};
  for (const file of fileList) {
    const detected = detectShiftFromFilename(file.name);
    if (!detected) continue;
    const text = await file.text();
    const parsed = parseCSV(text);
    results[detected.key] = {
      shift: detected.shift,
      data: parsed,
    };
  }
  return results;
}
