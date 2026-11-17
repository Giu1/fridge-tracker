/** Local storage backend for demo mode: items, photo jobs and photos stay on this device. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { toDataUrl } from './files';

/** Storage keys of each table in demo mode (all start with "demo." so resetDemo wipes them). */
export const DEMO_KEYS = {
  items: 'demo.items.v1',
  photo_jobs: 'demo.jobs.v1',
  locations: 'demo.locations.v1',
  receipts: 'demo.receipts.v1',
  receipt_items: 'demo.receipt_items.v1',
  categories: 'demo.categories.v1',
} as const;
const PHOTO = 'demo.photo.';

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());
export const subscribeDemo = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

export async function readDemo<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
export async function writeDemo(key: string, value: unknown) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    throw new Error('Browser storage is full. Remove some items or photos (demo mode keeps everything in this browser).');
  }
  emit();
}

export const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;


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

/** Any file (receipt photo or PDF) as a data: URL in demo mode. */
export async function putDemoFile(localUri: string) {
  const blob = await (await fetch(localUri)).blob();
  if (blob.size > 3_000_000) throw new Error('Demo mode keeps files in this browser: pick one under 3 MB.');
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
  const path = `demo/${newId()}`;
  try {
    await AsyncStorage.setItem(PHOTO + path, dataUrl);
  } catch {
    throw new Error('Browser storage is full: no room for this file in demo mode.');
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
