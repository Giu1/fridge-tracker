import { DEMO_KEYS, newId, readDemo, writeDemo } from './demo';
import { addItem, isoInDays, removePhotoIfUnused, updateItem, uploadPhoto } from './items';
import { isDemo } from './mode';
import { deleteRow, insertRow, tableStore, updateRow, useStore } from './store';
import { storeLabels } from './stores';
import { supabase } from './supabase';
import type { Decision, Detection, Item, ItemDraft, Location, PhotoJob, Product } from './types';

/** Photos waiting for the AI or for your review. */
export const jobsStore = tableStore<PhotoJob>({
  table: 'photo_jobs',
  demoKey: DEMO_KEYS.photo_jobs,
  sort: (a, b) => a.created_at.localeCompare(b.created_at),
});

/** Upload one photo into the AI inbox. */
export async function queuePhoto(localUri: string) {
  const photo_path = await uploadPhoto(localUri, 'inbox');
  if (isDemo()) {
    // No AI in demo mode: the photo goes straight to Review, where you type what it is.
    const job: PhotoJob = {
      id: newId(), photo_path, status: 'ready', decisions: [], error: null, cost_usd: 0, created_at: new Date().toISOString(),
      detections: [{ name_pt: '', brand: null, quantity: null, location: 'fridge', shelf_life_days: null, confidence: 0, candidates: [] }],
    };
    await writeDemo(DEMO_KEYS.photo_jobs, [...(await readDemo<PhotoJob[]>(DEMO_KEYS.photo_jobs, [])), job]);
    jobsStore.upsertLocal(job);
    return;
  }
  await insertRow(jobsStore, { photo_path } as Partial<PhotoJob>);
}

/** Wake the background worker (it returns immediately and keeps processing on the server). */
export async function kickWorker() {
  if (isDemo()) return;
  const { error } = await supabase.functions.invoke('process-photos', { body: {} });
  if (error) throw error;
}

export async function retryJob(job: PhotoJob) {
  if (isDemo()) return;
  await supabase.from('photo_jobs').update({ status: 'pending', error: null, attempts: 0 }).eq('id', job.id);
  await kickWorker();
}

/** Fields that tie an item to a real supermarket product (Open Food Facts). */
export function productFields(product: Product): Partial<ItemDraft> {
  return {
    barcode: product.code || null,
    brand: product.brand,
    product_name: product.name,
    stores: product.stores.length ? storeLabels(product.stores) : null,
    nutriscore: product.nutriscore,
    nova_group: product.nova_group,
    kcal_100g: product.kcal_100g,
    off_image_url: product.image_url,
  };
}

/** Turn a detection (+ the chosen supermarket product, or none) into a new item. */
export async function acceptDetection(job: PhotoJob, index: number, product: Product | null, typedName?: string, location?: Location) {
  const d = job.detections![index];
  const item = await addItem({
    name: product ? product.name : typedName?.trim() || d.name_pt || 'Food',
    quantity: product?.quantity ?? d.quantity,
    location: location ?? d.location,
    expires_on: d.shelf_life_days != null ? isoInDays(d.shelf_life_days) : null,
    photo_path: job.photo_path,
    barcode: null,
    brand: d.brand,
    product_name: null,
    stores: null,
    nutriscore: null,
    nova_group: null,
    kcal_100g: null,
    off_image_url: null,
    notes: null,
    ...(product ? productFields(product) : {}),
  });
  await decide(job, index, { status: 'accepted', item_id: item.id });
}

/**
 * Match a photo to an item you already created: the item gets this photo (and the chosen product,
 * if it had none yet) instead of a duplicate being added.
 */
export async function linkDetectionToItem(job: PhotoJob, index: number, item: Item, product: Product | null) {
  const patch: Partial<ItemDraft> = { photo_path: job.photo_path };
  if (product && !item.barcode) Object.assign(patch, productFields(product));
  await updateItem(item, patch);
  await decide(job, index, { status: 'accepted', item_id: item.id });
}

export async function rejectDetection(job: PhotoJob, index: number) {
  await decide(job, index, { status: 'rejected' });
}

export async function discardJob(job: PhotoJob) {
  await deleteRow(jobsStore, job.id);
  await removePhotoIfUnused(job.photo_path);
}

async function decide(job: PhotoJob, index: number, decision: Decision) {
  // Use the latest copy: another detection of the same photo may have just been decided.
  const current = jobsStore.rows().find((j) => j.id === job.id) ?? job;
  const decisions = [...(current.decisions ?? [])];
  decisions[index] = decision;
  const total = current.detections?.length ?? 0;
  const done = decisions.filter(Boolean).length >= total;
  if (done) {
    // Everything decided: the job leaves the inbox; the photo stays only if an item uses it.
    await discardJob(current);
  } else {
    await updateRow(jobsStore, current.id, { decisions });
  }
}

export function bestCandidate(d: Detection) {
  const top = d.candidates[0];
  return top && top.match >= 0.55 ? top : null;
}

/** Live inbox of AI jobs. */
export function useJobs() {
  const { rows, loading } = useStore(jobsStore);
  return { jobs: rows, loading, reload: jobsStore.refresh };
}

