import { prepareImage, readBytes } from './files';
import { DEMO_KEYS, demoPhotoUrls, putDemoPhoto, readDemo, removeDemoPhoto } from './demo';
import { kvGet, kvSet, markProductUsed } from './localdb';
import { isDemo } from './mode';
import { deleteRow, insertRow, tableStore, updateRow, useStore } from './store';
import { PHOTO_BUCKET, supabase } from './supabase';
import type { Item, ItemDraft } from './types';

const randomId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** Resize + upload a local photo to the private bucket; returns its storage path. */
export async function uploadPhoto(localUri: string, folder: 'items' | 'inbox' = 'items') {
  if (isDemo()) return putDemoPhoto(localUri);
  const small = await prepareImage(localUri).catch(() => localUri);
  const bytes = await readBytes(small);
  const path = `${folder}/${randomId()}.jpg`;
  const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;
  return path;
}

// Signed links (valid 1 h) for the private bucket. Kept on this device so photos show at once after a reload,
// and requested in one batch per screen instead of one request per photo.
const urlCache = new Map<string, { url: string; exp: number }>();
const TTL = 60 * 60;
const URL_KEY = 'signed-urls.v1';
let urlCacheLoaded: Promise<void> | null = null;
let pending = new Set<string>();
let flush: Promise<void> | null = null;

const loadUrlCache = () =>
  (urlCacheLoaded ??= kvGet(URL_KEY)
    .then((raw) => {
      const now = Date.now() / 1000;
      for (const [p, v] of Object.entries(raw ? (JSON.parse(raw) as Record<string, { url: string; exp: number }>) : {}))
        if (v.exp > now + 300 && !urlCache.has(p)) urlCache.set(p, v);
    })
    .catch(() => {}));

const saveUrlCache = () => {
  const now = Date.now() / 1000;
  const live = Object.fromEntries([...urlCache].filter(([, v]) => v.exp > now + 300));
  kvSet(URL_KEY, JSON.stringify(live)).catch(() => {});
};

/** Signed link already on this device (no network), for an instant first render. */
export function cachedPhotoUrl(path: string | null) {
  if (!path || isDemo()) return null;
  const hit = urlCache.get(path);
  return hit && hit.exp > Date.now() / 1000 + 300 ? hit.url : null;
}

export async function photoUrls(paths: string[]) {
  if (isDemo()) return demoPhotoUrls(paths);
  await loadUrlCache();
  const now = Date.now() / 1000;
  for (const p of paths) if ((urlCache.get(p)?.exp ?? 0) < now + 300) pending.add(p);
  if (pending.size) {
    // Collect every photo asked for in this moment, then sign them all in one request.
    flush ??= new Promise<void>((resolve) => setTimeout(resolve, 15)).then(async () => {
      const batch = [...pending];
      pending = new Set();
      flush = null;
      const { data } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(batch, TTL);
      const at = Date.now() / 1000;
      for (const d of data ?? []) if (d.path && d.signedUrl) urlCache.set(d.path, { url: d.signedUrl, exp: at + TTL });
      saveUrlCache();
    });
    await flush;
  }
  const out: Record<string, string> = {};
  for (const p of paths) {
    const hit = urlCache.get(p);
    if (hit) out[p] = hit.url;
  }
  return out;
}

/** Forget saved signed links (sign-out). */
export function clearPhotoUrls() {
  urlCache.clear();
  kvSet(URL_KEY, null).catch(() => {});
}

/** Load saved signed links early (called at start-up). */
export const warmPhotoUrls = () => loadUrlCache();

/** Delete a photo only when no item still points at it (one photo can hold several foods). */
export async function removePhotoIfUnused(path: string | null) {
  if (!path) return;
  if (isDemo()) {
    const items = await readDemo<Item[]>(DEMO_KEYS.items, []);
    if (!items.some((i) => i.photo_path === path)) await removeDemoPhoto(path);
    return;
  }
  const { count } = await supabase.from('items').select('id', { count: 'exact', head: true }).eq('photo_path', path);
  if (!count) await supabase.storage.from(PHOTO_BUCKET).remove([path]);
}

/** The shared household inventory (fridge, freezer, emergency supplies and any other place). */
export const itemsStore = tableStore<Item>({
  table: 'items',
  demoKey: DEMO_KEYS.items,
  sort: (a, b) => b.created_at.localeCompare(a.created_at),
});

export async function addItem(draft: ItemDraft, localPhotoUri?: string | null) {
  const photo_path = localPhotoUri ? await uploadPhoto(localPhotoUri) : draft.photo_path;
  const item = await insertRow(itemsStore, { ...draft, photo_path, ...(isDemo() ? { added_by: 'demo' } : {}) });
  if (draft.barcode) markProductUsed(draft.barcode).catch(() => {});
  return item;
}

export async function updateItem(item: Item, patch: Partial<ItemDraft>, localPhotoUri?: string | null) {
  let photo_path = patch.photo_path ?? item.photo_path;
  if (localPhotoUri) photo_path = await uploadPhoto(localPhotoUri);
  const updated = await updateRow(itemsStore, item.id, { ...patch, photo_path });
  if (item.photo_path && item.photo_path !== photo_path) await removePhotoIfUnused(item.photo_path);
  if (patch.barcode && patch.barcode !== item.barcode) markProductUsed(patch.barcode).catch(() => {});
  return updated;
}

export async function deleteItem(item: Item) {
  await deleteRow(itemsStore, item.id);
  await removePhotoIfUnused(item.photo_path);
}

/** Live list of the shared household: instant from this device's copy, then kept in sync. */
export function useItems() {
  const { rows, loading, offline } = useStore(itemsStore);
  return { items: rows, loading, offline, reload: itemsStore.refresh };
}

export function useItem(id: string | undefined) {
  const { items, loading } = useItems();
  return { item: id ? items.find((i) => i.id === id) ?? null : null, loading };
}

export function daysUntil(date: string | null) {
  if (!date) return null;
  const d = new Date(`${date}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

export const isoInDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
