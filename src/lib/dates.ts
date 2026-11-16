/** Local-time date helpers for expiry dates (stored as YYYY-MM-DD). */

const pad = (n: number) => String(n).padStart(2, '0');

/** A Date as YYYY-MM-DD in local time (toISOString would use UTC and can be off by a day). */
export const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** YYYY-MM-DD to a local Date at midnight. */
export const fromIso = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

export const daysInMonth = (y: number, m1: number) => new Date(y, m1, 0).getDate();

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "Sun 12 Dec 2027 · in 391 days" */
export function describeDate(iso: string, today = startOfToday()) {
  const d = fromIso(iso);
  const n = Math.round((d.getTime() - today.getTime()) / 86400000);
  const rel = n === 0 ? 'today' : n === 1 ? 'tomorrow' : n === -1 ? 'yesterday' : n > 0 ? `in ${n} days` : `${-n} days ago`;
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} · ${rel}`;
}

export type Parsed = { iso: string } | { error: string };

const MAX_YEARS_AHEAD = 10;

function build(y: number, m: number, d: number | 'end', today: Date): Parsed {
  if (m < 1 || m > 12) return { error: `There is no month ${m}.` };
  const last = daysInMonth(y, m);
  const day = d === 'end' ? last : d;
  if (day < 1 || day > last) return { error: `${MONTH_NAMES[m - 1]} ${y} has ${last} days.` };
  const maxYear = today.getFullYear() + MAX_YEARS_AHEAD;
  if (y > maxYear) {
    // 2227 → 2027: most likely a slipped digit.
    const guess = today.getFullYear() - (today.getFullYear() % 100) + (y % 100);
    const hint = guess >= today.getFullYear() && guess <= maxYear ? ` Did you mean ${guess}?` : '';
    return { error: `${y} is too far ahead.${hint}` };
  }
  if (y < 2000) return { error: `${y} is too far in the past.` };
  return { iso: `${y}-${pad(m)}-${pad(day)}` };
}

/**
 * Lenient expiry input. Accepts:
 *   YYYY-MM-DD, YYYY/MM/DD, YYYY.MM.DD, YYYYMMDD  → that day
 *   YYYY-MM, YYYYMM                               → last day of that month
 *   MM-DD, MMDD                                   → this year, or next year if already past
 *   D or DD                                       → that day this month, or next month if already past
 * Returns null for an empty string.
 */
export function parseDateInput(raw: string, today = startOfToday()): Parsed | null {
  const s = raw.trim();
  if (!s) return null;
  const y0 = today.getFullYear();
  const upcoming = (m: number, d: number): Parsed => {
    const r = build(y0, m, d, today);
    if ('iso' in r && fromIso(r.iso) < today) return build(y0 + 1, m, d, today);
    return r;
  };

  if (/^\d+$/.test(s)) {
    const n = (a: number, b: number) => Number(s.slice(a, b));
    switch (s.length) {
      case 8: return build(n(0, 4), n(4, 6), n(6, 8), today);
      case 6: return build(n(0, 4), n(4, 6), 'end', today);
      case 4: return upcoming(n(0, 2), n(2, 4));
      case 1:
      case 2: {
        const d = Number(s);
        const r = build(y0, today.getMonth() + 1, d, today);
        if ('iso' in r && fromIso(r.iso) >= today) return r;
        const next = new Date(y0, today.getMonth() + 1, 1);
        return build(next.getFullYear(), next.getMonth() + 1, d, today);
      }
    }
    return { error: 'Try YYYYMMDD, YYYYMM or MMDD.' };
  }

  const parts = s.split(/[-/.\s]+/).filter(Boolean);
  if (parts.some((p) => !/^\d+$/.test(p))) return { error: 'Use numbers only, like 2027-12-12.' };
  const nums = parts.map(Number);
  if (parts.length === 3 && parts[0].length === 4) return build(nums[0], nums[1], nums[2], today);
  if (parts.length === 2 && parts[0].length === 4) return build(nums[0], nums[1], 'end', today);
  if (parts.length === 2 && parts[0].length <= 2 && parts[1].length <= 2) return upcoming(nums[0], nums[1]);
  return { error: 'Try YYYY-MM-DD, YYYYMM or MMDD.' };
}
