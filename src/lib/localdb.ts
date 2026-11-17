/**
 * Local SQLite database on each phone.
 *  - products: every Open Food Facts (Portugal) product reference you have seen or used,
 *    so suggestions work offline and get better over time.
 *  - kv: small settings plus the last synced copy of each shared table (see store.ts), so the app opens instantly
 *    and works with no signal.
 */
import * as SQLite from 'expo-sqlite';
import type { Product } from './types';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('fridge.db');
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS products (
          code TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          brand TEXT,
          quantity TEXT,
          nutriscore TEXT,
          nova_group INTEGER,
          kcal_100g REAL,
          image_url TEXT,
          stores TEXT NOT NULL DEFAULT '',
          categories TEXT,
          use_count INTEGER NOT NULL DEFAULT 0,
          updated_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS products_name_idx ON products(name);
        DROP TABLE IF EXISTS items_cache2;
        CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY NOT NULL, v TEXT);
      `);
      return db;
    })();
  }
  return dbPromise;
}

interface ProductRow {
  code: string;
  name: string;
  brand: string | null;
  quantity: string | null;
  nutriscore: string | null;
  nova_group: number | null;
  kcal_100g: number | null;
  image_url: string | null;
  stores: string;
  categories: string | null;
  use_count: number;
}

const rowToProduct = (r: ProductRow): Product & { use_count: number } => ({
  code: r.code,
  name: r.name,
  brand: r.brand,
  quantity: r.quantity,
  nova_group: r.nova_group,
  kcal_100g: r.kcal_100g,
  image_url: r.image_url,
  categories: r.categories,
  use_count: r.use_count,
});

export async function upsertProducts(products: Product[]) {
  if (!products.length) return;
  const db = await getDb();
  const now = Date.now();
  await db.withTransactionAsync(async () => {
    for (const p of products) {
      await db.runAsync(
        `INSERT INTO products (code,name,brand,quantity,nutriscore,nova_group,kcal_100g,image_url,stores,categories,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(code) DO UPDATE SET name=excluded.name, brand=excluded.brand, quantity=excluded.quantity,
           nutriscore=excluded.nutriscore, nova_group=excluded.nova_group, kcal_100g=excluded.kcal_100g,
           image_url=excluded.image_url, stores=excluded.stores, categories=excluded.categories, updated_at=excluded.updated_at`,
        // nutriscore and stores columns are no longer used (kept so old local databases need no migration)
        p.code, p.name, p.brand, p.quantity, null, p.nova_group, p.kcal_100g, p.image_url,
        '', p.categories ?? null, now,
      );
    }
  });
}

export async function markProductUsed(code: string) {
  const db = await getDb();
  await db.runAsync('UPDATE products SET use_count = use_count + 1 WHERE code = ?', code);
}

/** Candidate products for fuzzy search: anything sharing a 3-letter prefix with a typed word, plus favourites. */
export async function localCandidates(query: string, limit = 400) {
  const db = await getDb();
  const words = query
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().split(/\s+/).filter((w) => w.length >= 2);
  const likes = words.map((w) => `%${w.slice(0, 3)}%`);
  const where = likes.length ? likes.map(() => '(name LIKE ? OR brand LIKE ?)').join(' OR ') : '1=1';
  const params = likes.flatMap((l) => [l, l]);
  const rows = await db.getAllAsync<ProductRow>(
    `SELECT * FROM products WHERE ${where} ORDER BY use_count DESC, updated_at DESC LIMIT ${limit}`,
    params,
  );
  return rows.map(rowToProduct);
}

export async function productCount() {
  const db = await getDb();
  const r = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM products');
  return r?.n ?? 0;
}

export async function getProduct(code: string) {
  const db = await getDb();
  const r = await db.getFirstAsync<ProductRow>('SELECT * FROM products WHERE code = ?', code);
  return r ? rowToProduct(r) : null;
}

export async function kvGet(k: string) {
  const db = await getDb();
  const r = await db.getFirstAsync<{ v: string }>('SELECT v FROM kv WHERE k = ?', k);
  return r?.v ?? null;
}

export async function kvSet(k: string, v: string | null) {
  const db = await getDb();
  if (v === null) await db.runAsync('DELETE FROM kv WHERE k = ?', k);
  else await db.runAsync('INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)', k, v);
}
