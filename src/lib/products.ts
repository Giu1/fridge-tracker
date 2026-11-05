/**
 * Product suggestions for Portuguese supermarkets.
 * Source: Open Food Facts (open data, ODbL), restricted to products sold in Portugal.
 * Results are cached in the local SQLite DB and ranked with fuzzy matching, so typos
 * ("iogurt grgo", "leite mimosa") and missing accents still find the right product.
 */
import Fuse from 'fuse.js';
import { localCandidates, upsertProducts } from './localdb';
import { normaliseStores } from './stores';
import type { NutriScore, Product } from './types';

const UA = 'FridgeTrackerPersonal/1.0 (personal use app)';
const FIELDS = [
  'code', 'product_name', 'product_name_pt', 'generic_name_pt', 'brands', 'quantity',
  'nutriscore_grade', 'nova_group', 'nutriments', 'image_front_small_url', 'image_small_url',
  'stores', 'stores_tags', 'categories',
].join(',');

interface OffProduct {
  code?: string;
  product_name?: string;
  product_name_pt?: string;
  generic_name_pt?: string;
  brands?: string;
  quantity?: string;
  nutriscore_grade?: string;
  nova_group?: number;
  nutriments?: Record<string, number | string | undefined>;
  image_front_small_url?: string;
  image_small_url?: string;
  stores?: string;
  stores_tags?: string[];
  categories?: string;
}

const GRADES = ['a', 'b', 'c', 'd', 'e'];

export function fromOff(p: OffProduct): Product | null {
  const name = (p.product_name_pt || p.product_name || p.generic_name_pt || '').trim();
  if (!p.code || !name) return null;
  const grade = (p.nutriscore_grade || '').toLowerCase();
  const kcal = Number(p.nutriments?.['energy-kcal_100g']);
  return {
    code: p.code,
    name,
    brand: p.brands ? p.brands.split(',')[0].trim() : null,
    quantity: p.quantity?.trim() || null,
    nutriscore: GRADES.includes(grade) ? (grade as NutriScore) : null,
    nova_group: typeof p.nova_group === 'number' ? p.nova_group : null,
    kcal_100g: Number.isFinite(kcal) ? Math.round(kcal) : null,
    image_url: p.image_front_small_url || p.image_small_url || null,
    stores: normaliseStores([p.stores, ...(p.stores_tags ?? [])]),
    categories: p.categories ?? null,
  };
}

async function getJson(url: string, signal?: AbortSignal) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal });
  if (!res.ok) throw new Error(`Open Food Facts ${res.status}`);
  return res.json();
}

/** Search Open Food Facts restricted to Portugal (pt subdomain filters by country). */
export async function searchRemote(query: string, signal?: AbortSignal): Promise<Product[]> {
  const q = encodeURIComponent(query.trim());
  const url =
    `https://pt.openfoodfacts.org/cgi/search.pl?search_terms=${q}&search_simple=1&action=process&json=1` +
    `&page_size=40&sort_by=unique_scans_n&lc=pt&fields=${FIELDS}`;
  const data = await getJson(url, signal);
  const products = ((data?.products ?? []) as OffProduct[]).map(fromOff).filter((p): p is Product => !!p);
  await upsertProducts(products);
  return products;
}

/** Look up one product by barcode (from the scanner). */
export async function lookupBarcode(code: string): Promise<Product | null> {
  const data = await getJson(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${FIELDS}`);
  if (data?.status !== 1 || !data.product) return null;
  const p = fromOff({ ...data.product, code });
  if (p) await upsertProducts([p]);
  return p;
}

export interface Suggestion extends Product {
  score: number; // 0 = perfect
  inStore: boolean;
}

/**
 * Fuzzy-rank local + remote products for what the user typed.
 * `storeFilter` = supermarket keys the user cares about; matches get boosted, not hidden.
 */
export function rankSuggestions(query: string, products: (Product & { use_count?: number })[], storeFilter: string[], limit = 25): Suggestion[] {
  const unique = new Map<string, Product & { use_count?: number }>();
  for (const p of products) if (!unique.has(p.code)) unique.set(p.code, p);
  const fuse = new Fuse([...unique.values()], {
    keys: [
      { name: 'name', weight: 0.7 },
      { name: 'brand', weight: 0.3 },
    ],
    includeScore: true,
    ignoreLocation: true,
    ignoreDiacritics: true,
    threshold: 0.45,
    minMatchCharLength: 2,
  });
  return fuse
    .search(query)
    .map((r) => {
      const inStore = storeFilter.length === 0 || r.item.stores.some((s) => storeFilter.includes(s));
      let score = r.score ?? 1;
      if (storeFilter.length && inStore) score -= 0.15; // prefer the chosen supermarkets
      if (r.item.nutriscore) score -= 0.03; // prefer products with a Nutri-Score
      score -= Math.min(r.item.use_count ?? 0, 5) * 0.03; // prefer things you already buy
      return { ...r.item, score, inStore };
    })
    .sort((a, b) => a.score - b.score)
    .slice(0, limit);
}

export async function localSuggestions(query: string, storeFilter: string[]) {
  return rankSuggestions(query, await localCandidates(query), storeFilter);
}
