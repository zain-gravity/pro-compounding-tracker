// ─────────────────────────────────────────────────────────────
// formatter.js — Number Formatting Utilities
// ─────────────────────────────────────────────────────────────
// All functions return a display-ready **string**.  They accept
// any value and gracefully return '—' for invalid / missing
// inputs, so callers never have to null-check before formatting.
// ─────────────────────────────────────────────────────────────

/**
 * Format a number using the Indian numbering system
 * (en-IN locale) with exactly 2 decimal places.
 *
 * Invalid, null, undefined, or NaN values produce the em-dash
 * placeholder '—'.
 *
 * @param {*} n - Value to format.
 * @returns {string} Formatted string, e.g. "1,23,456.78"
 *
 * @example
 *   fmt(1234567.5)  // "12,34,567.50"
 *   fmt(null)       // "—"
 *   fmt(undefined)  // "—"
 *   fmt('abc')      // "—"
 */
export function fmt(n) {
  if (n === undefined || n === null || isNaN(n)) return '—';
  return Number(n).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Format a number with an explicit sign prefix.
 *   - Positive → "+1,234.56"
 *   - Negative → "-1,234.56"  (natural minus from toLocaleString)
 *   - Zero     → "+0.00"
 *
 * @param {*} n - Value to format.
 * @returns {string}
 *
 * @example
 *   fmtSigned(250)   // "+250.00"
 *   fmtSigned(-30)   // "-30.00"
 */
export function fmtSigned(n) {
  if (n === undefined || n === null || isNaN(n)) return '—';
  const prefix = n >= 0 ? '+' : '';
  return prefix + fmt(n);
}

/**
 * Compact format using Indian denominations.
 *
 * Thresholds:
 *   ≥ 1,00,00,000 (1 Crore)   → "X.XX Cr"
 *   ≥ 1,00,000    (1 Lakh)    → "X.XX L"
 *   ≥ 1,000                   → "X.X K"
 *   below 1,000                → standard fmt()
 *
 * The sign of the original number is preserved.
 *
 * @param {*} n - Value to format.
 * @returns {string}
 *
 * @example
 *   fmtCompact(15000000)  // "1.50 Cr"
 *   fmtCompact(250000)    // "2.50 L"
 *   fmtCompact(9500)      // "9.5 K"
 *   fmtCompact(450)       // "450.00"
 */
export function fmtCompact(n) {
  if (n === undefined || n === null || isNaN(n)) return '—';

  const num = Number(n);
  const abs = Math.abs(num);

  if (abs >= 10_000_000) {
    // 1 Crore = 10,000,000
    return (num / 10_000_000).toFixed(2) + ' Cr';
  }
  if (abs >= 100_000) {
    // 1 Lakh = 100,000
    return (num / 100_000).toFixed(2) + ' L';
  }
  if (abs >= 1_000) {
    return (num / 1_000).toFixed(1) + ' K';
  }

  // Below 1 K — use the full Indian-locale formatter
  return fmt(num);
}
