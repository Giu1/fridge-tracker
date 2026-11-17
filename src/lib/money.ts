/** Money helpers for receipt totals. Amounts are stored as whole cents (integer) to avoid rounding drift. */

/**
 * Cents from what people type or what a receipt list says: "12,34", "12.34", "€ 12,34", "1.234,56", "1,234.56",
 * "12" or a number. Returns null when there is no amount.
 */
export function parseMoney(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? Math.round(v * 100) : null;
  let s = String(v ?? '').replace(/[^\d.,-]/g, '');
  if (!s || !/\d/.test(s) || s.startsWith('-')) return null;
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  const dec = Math.max(lastDot, lastComma);
  // The last separator is the decimal one when 1 or 2 digits follow it; otherwise it groups thousands.
  if (dec >= 0 && s.length - dec - 1 <= 2) {
    s = s.slice(0, dec).replace(/[.,]/g, '') + '.' + s.slice(dec + 1);
  } else {
    s = s.replace(/[.,]/g, '');
  }
  const n = parseFloat(s);
  return Number.isFinite(n) && n >= 0 && n < 100000 ? Math.round(n * 100) : null;
}

/** 123456 → "1 234,56 €" (Portuguese style). */
export function euros(cents: number, opts: { whole?: boolean } = {}) {
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const whole = opts.whole ? Math.round(abs / 100) : Math.floor(abs / 100);
  const int = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const body = opts.whole ? int : `${int},${String(abs % 100).padStart(2, '0')}`;
  return `${neg ? '−' : ''}${body} €`;
}

/** Cents as the text to put back in an input: 1234 → "12,34". */
export const centsToInput = (cents: number | null | undefined) =>
  cents == null ? '' : `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, '0')}`;
