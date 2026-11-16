import { daysUntil } from './items';
import type { Theme } from './theme';
import type { Item } from './types';

export type ExpiryTone = 'bad' | 'soon' | 'ok' | 'odd';

/** Short, readable expiry text. Far-off dates read as weeks/months/years; impossible ones ask to check the date. */
export function expiryLabel(item: Pick<Item, 'expires_on'>, t: Theme) {
  const d = daysUntil(item.expires_on);
  if (d === null || Number.isNaN(d)) return null;
  const mk = (text: string, tone: ExpiryTone) => ({
    text,
    tone,
    color: tone === 'bad' ? t.danger : tone === 'soon' || tone === 'odd' ? t.warn : t.muted,
    bg: tone === 'bad' ? t.dangerSoft : tone === 'soon' || tone === 'odd' ? t.warnSoft : t.chip,
  });
  // More than ~20 years either way is a typo (e.g. 2226 instead of 2026), not a real date.
  if (Math.abs(d) > 7300) return mk('Check date', 'odd');
  if (d < -365) return mk(`Expired ${Math.floor(-d / 365)}y ago`, 'bad');
  if (d < -60) return mk(`Expired ${Math.round(-d / 30)}mo ago`, 'bad');
  if (d < 0) return mk(`Expired ${-d}d ago`, 'bad');
  if (d === 0) return mk('Expires today', 'bad');
  if (d === 1) return mk('Tomorrow', 'soon');
  if (d <= 2) return mk(`${d}d left`, 'soon');
  if (d < 21) return mk(`${d}d left`, 'ok');
  if (d < 60) return mk(`${Math.round(d / 7)}w left`, 'ok');
  if (d < 365) return mk(`${Math.round(d / 30)}mo left`, 'ok');
  return mk(`${Math.floor(d / 365)}y+ left`, 'ok');
}
