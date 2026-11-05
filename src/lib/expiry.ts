import { daysUntil } from './items';
import type { Theme } from './theme';
import type { Item } from './types';

export function expiryLabel(item: Item, t: Theme) {
  const d = daysUntil(item.expires_on);
  if (d === null) return null;
  if (d < 0) return { text: `Expired ${-d}d ago`, color: t.danger };
  if (d === 0) return { text: 'Expires today', color: t.danger };
  if (d <= 2) return { text: `${d}d left`, color: t.warn };
  return { text: `${d}d left`, color: t.muted };
}
