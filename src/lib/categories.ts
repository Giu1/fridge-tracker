/** Categories: a coloured tag with an icon for the kind of food (Dairy, Meat, ...). Created, renamed, recoloured and removed in the app. */
import { useMemo } from 'react';
import { DEMO_KEYS, readDemo, writeDemo } from './demo';
import { itemsStore } from './items';
import { isDemo } from './mode';
import { deleteRow, insertRow, tableStore, updateRow, useStore } from './store';
import type { Category, Item } from './types';

/** Colours offered for a category: saturated enough to read on a photo, in light and dark mode. */
export const CATEGORY_COLORS = [
  '#E5484D', '#F76B15', '#FFC53D', '#46A758', '#12A594',
  '#0090FF', '#6E56CF', '#D6409F', '#8D6E63', '#8B8D98',
];

const t0 = '2026-01-01T00:00:00.000Z';
/** Same starters as supabase/schema.sql; used for demo mode. */
const STARTERS: Category[] = [
  ['dairy', 'Dairy', '#0090FF', 'cheese'],
  ['meat', 'Meat', '#E5484D', 'food-drumstick'],
  ['fish', 'Fish', '#12A594', 'fish'],
  ['veg', 'Vegetables', '#46A758', 'carrot'],
  ['fruit', 'Fruit', '#F76B15', 'food-apple'],
  ['grains', 'Bread & grains', '#FFC53D', 'baguette'],
  ['drinks', 'Drinks', '#6E56CF', 'bottle-soda-classic'],
  ['leftovers', 'Leftovers', '#8D6E63', 'food-takeout-box'],
].map(([id, label, color, icon], sort) => ({ id, label, color, icon, sort, created_at: t0 }));

export const categoriesStore = tableStore<Category>({
  table: 'categories',
  demoKey: DEMO_KEYS.categories,
  sort: (a, b) => a.sort - b.sort || a.created_at.localeCompare(b.created_at),
  demoSeed: () => STARTERS,
});

export function useCategories() {
  const { rows, loading, offline } = useStore(categoriesStore);
  const byId = useMemo(() => new Map(rows.map((c) => [c.id, c])), [rows]);
  // No rows and the server refused: most likely supabase/schema.sql was not re-run yet.
  const missing = !loading && offline && !rows.length;
  return { categories: rows, byId, loading, missing };
}

/** White or near-black text, whichever reads better on the colour. */
export function textOn(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 170 ? '#1A1A1A' : '#FFFFFF';
}

/** The colour at low opacity, for soft backgrounds. */
export const tint = (hex: string, alpha = 0.16) =>
  `${hex}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`;

const friendly = (e: unknown) => {
  const msg = (e as Error)?.message ?? String(e);
  if (/categor|'icon'/i.test(msg) && /(does not exist|schema cache|not find)/i.test(msg))
    return new Error('Categories are not set up on the server yet. Run the updated supabase/schema.sql in Supabase (SQL Editor), then try again.');
  if (/duplicate key|categories_label_idx/i.test(msg)) return new Error('A category with that name already exists.');
  return e as Error;
};

const cleanLabel = (label: string) => label.trim().replace(/\s+/g, ' ').slice(0, 40);

/** `icon` null = not picked: the app shows a guess from the name (and the insert still works before the schema upgrade). */
export async function addCategory(label: string, color: string, icon: string | null) {
  const clean = cleanLabel(label);
  if (!clean) throw new Error('Give the category a name.');
  const rows = categoriesStore.rows();
  if (rows.some((c) => c.label.toLowerCase() === clean.toLowerCase())) throw new Error(`"${clean}" already exists.`);
  const sort = Math.max(-1, ...rows.map((c) => c.sort)) + 1;
  try {
    return await insertRow(categoriesStore, { label: clean, color, sort, ...(icon ? { icon } : {}) });
  } catch (e) {
    throw friendly(e);
  }
}

export async function editCategory(cat: Category, label: string, color: string, icon: string | null) {
  const clean = cleanLabel(label);
  if (!clean) throw new Error('The name cannot be empty.');
  if (categoriesStore.rows().some((c) => c.id !== cat.id && c.label.toLowerCase() === clean.toLowerCase()))
    throw new Error(`"${clean}" already exists.`);
  try {
    return await updateRow(categoriesStore, cat.id, { label: clean, color, ...(icon && icon !== cat.icon ? { icon } : {}) });
  } catch (e) {
    throw friendly(e);
  }
}

/** Remove a category; its items stay, just without a category (the database does the same). */
export async function removeCategory(cat: Category) {
  await deleteRow(categoriesStore, cat.id);
  if (isDemo()) {
    const items = await readDemo<Item[]>(DEMO_KEYS.items, []);
    await writeDemo(DEMO_KEYS.items, items.map((i) => (i.category_id === cat.id ? { ...i, category_id: null } : i)));
  }
  for (const i of itemsStore.rows()) if (i.category_id === cat.id) itemsStore.upsertLocal({ ...i, category_id: null });
}

/** Swap a category with its neighbour to reorder the list. */
export async function moveCategory(cat: Category, dir: -1 | 1) {
  const rows = categoriesStore.rows();
  const i = rows.findIndex((c) => c.id === cat.id);
  const other = rows[i + dir];
  if (!other) return;
  await updateRow(categoriesStore, cat.id, { sort: other.sort });
  await updateRow(categoriesStore, other.id, { sort: cat.sort === other.sort ? cat.sort + dir : cat.sort });
}
