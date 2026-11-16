/**
 * "Receitas Bimby":
 *  - turns stored items into a Cookidoo (pt-PT) search, and
 *  - keeps the Cookidoo recipes you save, with each ingredient linked to an item in the house.
 * Cookidoo has no public API, so the app only opens Cookidoo's own pages; it never logs in or scrapes.
 */
import Fuse from 'fuse.js';
import { DEMO_KEYS } from './demo';
import { daysUntil } from './items';
import { deleteRow, insertRow, tableStore, updateRow, useStore } from './store';
import type { Item, Recipe, RecipeIngredient } from './types';

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

/** Default selection: up to DEFAULT_PICK fridge items expiring within 5 days (frozen food and supplies skipped). */
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

// ---- Saved Cookidoo recipes ("tracking") ----------------------------------------------------------------

export const recipesStore = tableStore<Recipe>({
  table: 'recipes',
  demoKey: DEMO_KEYS.recipes,
  // on the menu first, then most recently cooked/added
  sort: (a, b) =>
    Number(b.planned) - Number(a.planned) ||
    (b.last_cooked_on ?? b.created_at).localeCompare(a.last_cooked_on ?? a.created_at),
});

export function useRecipes() {
  const { rows, loading } = useStore(recipesStore);
  return { recipes: rows, loading };
}

/** Accept Cookidoo links (any country site) and other https recipe links; returns null when empty. */
export function cleanRecipeUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  let u: URL;
  try {
    u = new URL(withScheme);
  } catch {
    throw new Error('That does not look like a link. Copy it from Cookidoo with Share > Copy link.');
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('Only web links are allowed.');
  u.protocol = 'https:';
  return u.toString();
}

export const isCookidoo = (url: string | null) => !!url && /(^|\.)cookidoo\.[a-z.]+$/i.test(safeHost(url));
export function safeHost(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

export interface RecipeInput {
  title: string;
  url: string;
  notes: string;
  ingredients: RecipeIngredient[];
}

const cleanIngredients = (list: RecipeIngredient[]) =>
  list
    .map((i) => ({ name: i.name.trim().slice(0, 120), item_id: i.item_id || null }))
    .filter((i) => i.name);

export async function saveRecipe(input: RecipeInput, existing?: Recipe | null) {
  const title = input.title.trim().slice(0, 200);
  if (!title) throw new Error('Give the recipe a name.');
  const values = {
    title,
    url: cleanRecipeUrl(input.url),
    notes: input.notes.trim() || null,
    ingredients: cleanIngredients(input.ingredients),
  };
  if (existing) return updateRow(recipesStore, existing.id, values);
  return insertRow(recipesStore, { ...values, planned: false, times_cooked: 0, last_cooked_on: null });
}

export const deleteRecipe = (r: Recipe) => deleteRow(recipesStore, r.id);
export const setPlanned = (r: Recipe, planned: boolean) => updateRow(recipesStore, r.id, { planned });
export const markCooked = (r: Recipe) =>
  updateRow(recipesStore, r.id, {
    times_cooked: r.times_cooked + 1,
    last_cooked_on: new Date().toISOString().slice(0, 10),
    planned: false,
  });

export type Stock = { item: Item; how: 'linked' | 'match' } | null;

/**
 * Is this ingredient in the house? First the item it was linked to, then (if that was used up)
 * any stored item whose name matches, so a re-bought "natas" still counts.
 */
export function stockFor(ing: RecipeIngredient, items: Item[], fuse: Fuse<Item>): Stock {
  const linked = ing.item_id ? items.find((i) => i.id === ing.item_id) : undefined;
  if (linked) return { item: linked, how: 'linked' };
  const hit = fuse.search(ing.name, { limit: 1 })[0];
  return hit && (hit.score ?? 1) <= 0.3 ? { item: hit.item, how: 'match' } : null;
}

export const itemFuse = (items: Item[]) =>
  new Fuse(items, { keys: ['name', 'product_name'], threshold: 0.35, includeScore: true, ignoreDiacritics: true, ignoreLocation: true });

/** Recipes that use this item (linked, or naming the same ingredient). */
export function recipesUsing(item: Item, recipes: Recipe[]) {
  const word = ingredientWord(item);
  return recipes.filter((r) =>
    r.ingredients.some((g) => g.item_id === item.id || (word.length > 2 && g.name.toLowerCase().includes(word))),
  );
}
