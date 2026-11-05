import { useCallback, useEffect, useState } from 'react';
import { prepareImage, readBytes } from './files';
import { cacheItems, cachedItems, markProductUsed } from './localdb';
import { PHOTO_BUCKET, supabase } from './supabase';
import type { Item, ItemDraft } from './types';

const randomId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** Resize + upload a local photo to the private bucket; returns its storage path. */
export async function uploadPhoto(localUri: string, folder: 'items' | 'inbox' = 'items') {
  const small = await prepareImage(localUri).catch(() => localUri);
  const bytes = await readBytes(small);
  const path = `${folder}/${randomId()}.jpg`;
  const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;
  return path;
}

// Short-lived signed URLs (1 h) for the private bucket; images stay cached on disk by storage path.
const urlCache = new Map<string, { url: string; exp: number }>();
const TTL = 60 * 60;

export async function photoUrls(paths: string[]) {
  const now = Date.now() / 1000;
  const missing = [...new Set(paths)].filter((p) => (urlCache.get(p)?.exp ?? 0) < now + 300);
  if (missing.length) {
    const { data } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(missing, TTL);
    for (const d of data ?? []) if (d.path && d.signedUrl) urlCache.set(d.path, { url: d.signedUrl, exp: now + TTL });
  }
  const out: Record<string, string> = {};
  for (const p of paths) {
    const hit = urlCache.get(p);
    if (hit) out[p] = hit.url;
  }
  return out;
}

/** Delete a photo only when no item still points at it (one photo can hold several foods). */
export async function removePhotoIfUnused(path: string | null) {
  if (!path) return;
  const { count } = await supabase.from('items').select('id', { count: 'exact', head: true }).eq('photo_path', path);
  if (!count) await supabase.storage.from(PHOTO_BUCKET).remove([path]);
}

export async function fetchItems() {
  const { data, error } = await supabase.from('items').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data as Item[];
}

export async function addItem(draft: ItemDraft, localPhotoUri?: string | null) {
  const photo_path = localPhotoUri ? await uploadPhoto(localPhotoUri) : draft.photo_path;
  const { data, error } = await supabase.from('items').insert({ ...draft, photo_path }).select().single();
  if (error) throw error;
  if (draft.barcode) markProductUsed(draft.barcode).catch(() => {});
  return data as Item;
}

export async function updateItem(item: Item, patch: Partial<ItemDraft>, localPhotoUri?: string | null) {
  let photo_path = patch.photo_path ?? item.photo_path;
  if (localPhotoUri) photo_path = await uploadPhoto(localPhotoUri);
  const { data, error } = await supabase.from('items').update({ ...patch, photo_path }).eq('id', item.id).select().single();
  if (error) throw error;
  if (localPhotoUri) await removePhotoIfUnused(item.photo_path);
  if (patch.barcode && patch.barcode !== item.barcode) markProductUsed(patch.barcode).catch(() => {});
  return data as Item;
}

export async function deleteItem(item: Item) {
  const { error } = await supabase.from('items').delete().eq('id', item.id);
  if (error) throw error;
  await removePhotoIfUnused(item.photo_path);
}

/** Live list of the shared fridge: cached copy first, then server, then realtime updates. */
export function useItems() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);

  const reload = useCallback(async () => {
    try {
      const fresh = await fetchItems();
      setItems(fresh);
      setOffline(false);
      cacheItems(fresh).catch(() => {});
    } catch {
      setOffline(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    cachedItems().then((c) => {
      if (active && c.length) {
        setItems((cur) => (cur.length ? cur : c));
        setLoading(false);
      }
    });
    reload();
    const channel = supabase
      .channel(`items-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, () => reload())
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [reload]);

  return { items, loading, offline, reload };
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
