import { DEMO_KEYS, newId, readDemo, writeDemo } from './demo';
import { addItem, isoInDays, removePhotoIfUnused, updateItem, uploadPhoto } from './items';
import { isDemo } from './mode';
import { deleteRow, insertRow, tableStore, updateRow, useStore } from './store';
import type { Decision, Detection, Item, ItemDraft, Location, PhotoJob, Product } from './types';

/** Photos waiting to be named. */
export const jobsStore = tableStore<PhotoJob>({
  table: 'photo_jobs',
  demoKey: DEMO_KEYS.photo_jobs,
  sort: (a, b) => a.created_at.localeCompare(b.created_at),
});

const blank = (): Detection => ({
  name_pt: '', brand: null, quantity: null, location: 'fridge', shelf_life_days: null, confidence: 0, candidates: [],
});

/**
 * Upload one photo into the photo inbox. There is no AI: in the inbox you say what is in it (search a
 * supermarket product, scan its barcode, or match it to an item you already created).
 */
export async function queuePhoto(localUri: string) {
  const photo_path = await uploadPhoto(localUri, 'inbox');
  const job = { photo_path, status: 'ready', decisions: [], detections: [blank()] } as Partial<PhotoJob>;
  if (isDemo()) {
    const row = { ...job, id: newId(), error: null, cost_usd: 0, created_at: new Date().toISOString() } as PhotoJob;
    await writeDemo(DEMO_KEYS.photo_jobs, [...(await readDemo<PhotoJob[]>(DEMO_KEYS.photo_jobs, [])), row]);
    jobsStore.upsertLocal(row);
    return;
  }
  await insertRow(jobsStore, job);
}

/** One photo can show several foods: add another one to name. */
export async function addFoodToPhoto(job: PhotoJob) {
  const current = jobsStore.rows().find((j) => j.id === job.id) ?? job;
  await updateRow(jobsStore, current.id, { detections: [...(current.detections ?? []), blank()] });
}

/** Fields that tie an item to a real supermarket product (Open Food Facts). */
export function productFields(product: Product): Partial<ItemDraft> {
  return {
    barcode: product.code || null,
    brand: product.brand,
    product_name: product.name,
    nova_group: product.nova_group,
    kcal_100g: product.kcal_100g,
    off_image_url: product.image_url,
  };
}

/** Turn a photo's food (+ the chosen supermarket product, or none) into a new item. */
export async function acceptDetection(job: PhotoJob, index: number, product: Product | null, typedName?: string, location?: Location) {
  const d = job.detections![index];
  const item = await addItem({
    name: product ? product.name : typedName?.trim() || d.name_pt || 'Food',
    amount: 1,
    location: location ?? d.location,
    expires_on: d.shelf_life_days != null ? isoInDays(d.shelf_life_days) : null,
    photo_path: job.photo_path,
    barcode: null,
    brand: d.brand,
    product_name: null,
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

/** Live inbox of photos waiting to be named. */
export function useJobs() {
  const { rows, loading } = useStore(jobsStore);
  return { jobs: rows, loading, reload: jobsStore.refresh };
}

