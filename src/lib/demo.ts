/** Local storage backend for demo mode: items, photo jobs and photos stay on this device. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { toDataUrl } from './files';
import type { Item, PhotoJob } from './types';

const ITEMS = 'demo.items.v1';
const JOBS = 'demo.jobs.v1';
const PHOTO = 'demo.photo.';

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());
export const subscribeDemo = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

async function read<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
async function write(key: string, value: unknown) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    throw new Error('Browser storage is full. Remove some items or photos (demo mode keeps everything in this browser).');
  }
  emit();
}

export const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export const demoItems = () => read<Item[]>(ITEMS, []);
export const saveDemoItems = (items: Item[]) => write(ITEMS, items);
export const demoJobs = () => read<PhotoJob[]>(JOBS, []);
export const saveDemoJobs = (jobs: PhotoJob[]) => write(JOBS, jobs);

export async function putDemoPhoto(localUri: string) {
  const dataUrl = await toDataUrl(localUri);
  const path = `demo/${newId()}`;
  try {
    await AsyncStorage.setItem(PHOTO + path, dataUrl);
  } catch {
    throw new Error('Browser storage is full: no room for more photos in demo mode.');
  }
  return path;
}

export async function demoPhotoUrls(paths: string[]) {
  const out: Record<string, string> = {};
  for (const p of paths) {
    const v = await AsyncStorage.getItem(PHOTO + p).catch(() => null);
    if (v) out[p] = v;
  }
  return out;
}

export async function removeDemoPhoto(path: string) {
  await AsyncStorage.removeItem(PHOTO + path).catch(() => {});
}

export async function resetDemo() {
  const keys = await AsyncStorage.getAllKeys();
  await AsyncStorage.multiRemove(keys.filter((k) => k.startsWith('demo.')));
  emit();
}
