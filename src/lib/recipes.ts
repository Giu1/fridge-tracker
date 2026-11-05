/**
 * "Receitas Bimby": turns fridge items into a Cookidoo (pt-PT) search.
 * Cookidoo has no public API, so we only open its own search page. Nothing is fetched or stored.
 */
import { daysUntil } from './items';
import type { Item } from './types';

const COOKIDOO_SEARCH = 'https://cookidoo.pt/search/pt-PT';

/** Max ingredients pre-selected; Cookidoo search gets vague with long queries. */
export const DEFAULT_PICK = 3;

const UNIT = /^\d+([.,]\d+)?\s*(x|un|g|gr|kg|mg|ml|cl|dl|l|lt|%)?$/i;
const NOISE = new Set(['de', 'da', 'do', 'das', 'dos', 'com', 'sem', 'e', 'em', 'pack', 'embalagem', 'bio', 'light', 'magro', 'meio-gordo']);

/** "Iogurte Grego Mimosa 4x125g" (brand Mimosa) -> "iogurte grego". User can still edit the result. */
export function ingredientWord(item: Pick<Item, 'name' | 'brand'>): string {
  const brandWords = new Set((item.brand ?? '').toLowerCase().split(/[\s,]+/).filter(Boolean));
  const words = item.name
    .toLowerCase()
    .replace(/[()[\]{}/\\|+*,;:!?"“”«»]/g, ' ')
    .replace(/\d+\s*x\s*\d+\s*\w*/g, ' ') // 4x125g
    .split(/\s+/)
    .filter((w) => w && !UNIT.test(w) && !brandWords.has(w) && !/^\d/.test(w));
  // Keep the first two meaningful words ("peito de frango" -> "peito frango", "iogurte grego").
  const out = words.filter((w) => !NOISE.has(w)).slice(0, 2);
  return out.join(' ') || item.name.trim().toLowerCase();
}

/** Items most worth cooking first: expired/expiring soonest, then the rest (newest first, as given). */
export function byUrgency(items: Item[]): Item[] {
  return [...items].sort((a, b) => {
    const da = daysUntil(a.expires_on) ?? Infinity;
    const db = daysUntil(b.expires_on) ?? Infinity;
    return da - db;
  });
}

/** Default selection: up to DEFAULT_PICK fridge items expiring within 5 days (frozen/pantry staples skipped). */
export function defaultPick(sorted: Item[]): string[] {
  const urgent = sorted.filter((i) => {
    const d = daysUntil(i.expires_on);
    return i.location === 'fridge' && d !== null && d <= 5;
  });
  const pool = urgent.length ? urgent : sorted.filter((i) => i.location === 'fridge');
  return pool.slice(0, DEFAULT_PICK).map((i) => i.id);
}

export function cookidooSearchUrl(terms: string[]): string {
  const query = [...new Set(terms.map((t) => t.trim()).filter(Boolean))].join(' ');
  return query ? `${COOKIDOO_SEARCH}?query=${encodeURIComponent(query)}` : COOKIDOO_SEARCH;
}
