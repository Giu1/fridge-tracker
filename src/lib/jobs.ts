import { useCallback, useEffect, useState } from 'react';
import { addItem, isoInDays, removePhotoIfUnused, uploadPhoto } from './items';
import { storeLabels } from './stores';
import { supabase } from './supabase';
import type { Decision, Detection, PhotoJob, Product } from './types';

/** Upload one photo into the AI inbox. */
export async function queuePhoto(localUri: string) {
  const photo_path = await uploadPhoto(localUri, 'inbox');
  const { error } = await supabase.from('photo_jobs').insert({ photo_path });
  if (error) throw error;
}

/** Wake the background worker (it returns immediately and keeps processing on the server). */
export async function kickWorker() {
  const { error } = await supabase.functions.invoke('process-photos', { body: {} });
  if (error) throw error;
}

export async function retryJob(job: PhotoJob) {
  await supabase.from('photo_jobs').update({ status: 'pending', error: null, attempts: 0 }).eq('id', job.id);
  await kickWorker();
}

/** Turn a detection (+ the chosen supermarket product, or none) into a fridge item. */
export async function acceptDetection(job: PhotoJob, index: number, product: Product | null) {
  const d = job.detections![index];
  const item = await addItem({
    name: product ? product.name : d.name_pt,
    quantity: product?.quantity ?? d.quantity,
    location: d.location,
    expires_on: d.shelf_life_days != null ? isoInDays(d.shelf_life_days) : null,
    photo_path: job.photo_path,
    barcode: product?.code ?? null,
    brand: product?.brand ?? d.brand,
    product_name: product?.name ?? null,
    stores: product?.stores.length ? storeLabels(product.stores) : null,
    nutriscore: product?.nutriscore ?? null,
    nova_group: product?.nova_group ?? null,
    kcal_100g: product?.kcal_100g ?? null,
    off_image_url: product?.image_url ?? null,
    notes: null,
  });
  await decide(job, index, { status: 'accepted', item_id: item.id });
}

export async function rejectDetection(job: PhotoJob, index: number) {
  await decide(job, index, { status: 'rejected' });
}

export async function discardJob(job: PhotoJob) {
  await supabase.from('photo_jobs').delete().eq('id', job.id);
  await removePhotoIfUnused(job.photo_path);
}

async function decide(job: PhotoJob, index: number, decision: Decision) {
  const decisions = [...(job.decisions ?? [])];
  decisions[index] = decision;
  const total = job.detections?.length ?? 0;
  const done = decisions.filter(Boolean).length >= total;
  if (done) {
    // Everything decided: the job leaves the inbox; the photo stays only if an item uses it.
    await discardJob(job);
  } else {
    const { error } = await supabase.from('photo_jobs').update({ decisions }).eq('id', job.id);
    if (error) throw error;
  }
}

export function bestCandidate(d: Detection) {
  const top = d.candidates[0];
  return top && top.match >= 0.55 ? top : null;
}

/** Live inbox of AI jobs. */
export function useJobs() {
  const [jobs, setJobs] = useState<PhotoJob[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const { data } = await supabase.from('photo_jobs').select('*').order('created_at', { ascending: true });
    if (data) setJobs(data as PhotoJob[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
    const channel = supabase
      .channel(`jobs-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'photo_jobs' }, () => reload())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [reload]);

  return { jobs, loading, reload };
}
