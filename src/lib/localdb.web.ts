/**
 * Web version of the local database (browser storage instead of SQLite).
 * Same functions as localdb.ts: product cache for suggestions + last copy of the fridge.
 */
import type { Item, Product } from './types';

type Stored = Product & { use_count: number; updated_at: number };
const P_KEY = 'fridge.products.v1';
const I_KEY = 'fridge.items.v1';
const KV = 'fridge.kv.';
const MAX_PRODUCTS = 3000;

function load<T>(key: string, fallback: T): T {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or blocked: the app still works, just without the offline cache
  }
}

let products: Record<string, Stored> | null = null;
const all = () => (products ??= load<Record<string, Stored>>(P_KEY, {}));
const persist = () => {
  const list = Object.values(all());
  if (list.length > MAX_PRODUCTS) {
    list.sort((a, b) => b.use_count - a.use_count || b.updated_at - a.updated_at);
    products = Object.fromEntries(list.slice(0, MAX_PRODUCTS).map((p) => [p.code, p]));
  }
  save(P_KEY, products);
};

export async function upsertProducts(list: Product[]) {
  const map = all();
  const now = Date.now();
  for (const p of list) map[p.code] = { ...p, use_count: map[p.code]?.use_count ?? 0, updated_at: now };
  persist();
}

export async function markProductUsed(code: string) {
  const p = all()[code];
  if (p) {
    p.use_count += 1;
    persist();
  }
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export async function localCandidates(query: string, limit = 400) {
  const words = fold(query).split(/\s+/).filter((w) => w.length >= 2).map((w) => w.slice(0, 3));
  return Object.values(all())
    .filter((p) => !words.length || words.some((w) => fold(`${p.name} ${p.brand ?? ''}`).includes(w)))
    .sort((a, b) => b.use_count - a.use_count || b.updated_at - a.updated_at)
    .slice(0, limit);
}

export async function productCount() {
  return Object.keys(all()).length;
}

export async function getProduct(code: string) {
  return all()[code] ?? null;
}

export async function cacheItems(items: Item[]) {
  save(I_KEY, items);
}

export async function cachedItems(): Promise<Item[]> {
  return load<Item[]>(I_KEY, []);
}

export async function kvGet(k: string) {
  try {
    return globalThis.localStorage?.getItem(KV + k) ?? null;
  } catch {
    return null;
  }
}

export async function kvSet(k: string, v: string | null) {
  try {
    if (v === null) globalThis.localStorage?.removeItem(KV + k);
    else globalThis.localStorage?.setItem(KV + k, v);
  } catch {
    // ignore
  }
}
