/**
 * Receipts, done by hand (no AI in the app):
 *  1. Send a receipt (photo or PDF): it is stored in the private "receipts" bucket and listed for both accounts.
 *  2. Download it, turn it into a list with any AI you like, outside the app.
 *  3. Import that list: each line becomes a draft (receipt_items) with a photo suggested from earlier items with a
 *     similar name, and you correct the whole list on one page before saving it as items.
 */
import Fuse from 'fuse.js';
import { Linking, Platform } from 'react-native';
import { parseDateInput, toIso } from './dates';
import { DEMO_KEYS, demoPhotoUrls, putDemoFile, readDemo, removeDemoPhoto, writeDemo } from './demo';
import { readBytes } from './files';
import { isoInDays, itemsStore, removePhotoIfUnused } from './items';
import { isDemo } from './mode';
import type { ParsedLine, ReceiptMeta } from './receiptList';
import { deleteRow, insertRow, insertRows, tableStore, updateRow, useStore } from './store';
import { supabase } from './supabase';
import type { Category, Item, Location, PhotoMatch, Place, Receipt, ReceiptLine } from './types';

export const RECEIPT_BUCKET = 'receipts';

/** The day a receipt counts for: the purchase day when known, otherwise the day it was sent (local time). */
export const receiptDay = (r: Receipt) => r.purchased_on || toIso(new Date(r.created_at));

export const receiptsStore = tableStore<Receipt>({
  table: 'receipts',
  demoKey: DEMO_KEYS.receipts,
  // Newest purchase first, so the list reads like a timeline.
  sort: (a, b) => receiptDay(b).localeCompare(receiptDay(a)) || b.created_at.localeCompare(a.created_at),
});

export const linesStore = tableStore<ReceiptLine>({
  table: 'receipt_items',
  demoKey: DEMO_KEYS.receipt_items,
  sort: (a, b) => a.sort - b.sort || a.created_at.localeCompare(b.created_at),
});

export function useReceipts() {
  const { rows, loading, offline } = useStore(receiptsStore);
  return { receipts: rows, loading, offline, reload: receiptsStore.refresh };
}

export function useReceiptLines(receiptId: string | undefined) {
  const { rows, loading } = useStore(linesStore);
  return { lines: receiptId ? rows.filter((l) => l.receipt_id === receiptId) : [], all: rows, loading };
}

const safeName = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(-80) || 'receipt';

const extOf = (name: string, mime: string) =>
  /\.([a-z0-9]{2,5})$/i.exec(name)?.[1]?.toLowerCase() ??
  ({ 'application/pdf': 'pdf', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic' } as Record<string, string>)[mime] ??
  'jpg';

export function guessMime(name: string, mime?: string | null) {
  if (mime && mime !== 'application/octet-stream') return mime;
  const ext = extOf(name, '');
  return ext === 'pdf' ? 'application/pdf' : ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'heic' ? 'image/heic' : 'image/jpeg';
}

/** Store a receipt photo or PDF and list it. */
export async function sendReceipt(file: { uri: string; name?: string | null; mimeType?: string | null; size?: number | null }) {
  const stamp = new Date();
  const mime = guessMime(file.name ?? '', file.mimeType);
  const name = file.name?.trim() || `receipt-${stamp.toISOString().slice(0, 16).replace(/[:T]/g, '-')}.${extOf('', mime)}`;
  if (file.size && file.size > 20 * 1024 * 1024) throw new Error('That file is over 20 MB.');
  let file_path: string;
  let size = file.size ?? null;
  if (isDemo()) {
    file_path = await putDemoFile(file.uri);
  } else {
    const bytes = await readBytes(file.uri);
    size = bytes.byteLength;
    if (size > 20 * 1024 * 1024) throw new Error('That file is over 20 MB.');
    file_path = `${stamp.getFullYear()}/${String(stamp.getMonth() + 1).padStart(2, '0')}/${Date.now().toString(36)}-${safeName(name)}`;
    const { error } = await supabase.storage.from(RECEIPT_BUCKET).upload(file_path, bytes, { contentType: mime, upsert: false });
    if (error) throw error;
  }
  try {
    return await insertRow(receiptsStore, {
      title: null,
      file_path,
      file_name: name.slice(0, 200),
      mime_type: mime,
      size_bytes: size,
      status: 'sent',
      item_count: 0,
    });
  } catch (e) {
    if (!isDemo()) await supabase.storage.from(RECEIPT_BUCKET).remove([file_path]);
    throw e;
  }
}

/** A purchase date as written on a list: 2026-11-17, 17/11/2026, 17-11-26, 20261117. Never in the future. */
export function purchaseDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim().slice(0, 10);
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  const p = m ? parseDateInput(`${m[3].length === 2 ? `20${m[3]}` : m[3]}-${m[2]}-${m[1]}`) : parseDateInput(s);
  if (!p || !('iso' in p)) return null;
  return p.iso <= toIso(new Date()) ? p.iso : null;
}

/** Save the shop, purchase day and amount paid of a receipt. */
export async function updateReceiptDetails(r: Receipt, patch: Pick<Receipt, 'shop' | 'purchased_on' | 'total_cents'>) {
  try {
    return await updateRow(receiptsStore, r.id, patch);
  } catch (e) {
    const msg = (e as Error).message ?? '';
    if (/purchased_on|total_cents|shop|column/i.test(msg)) {
      throw new Error('The database needs the latest supabase/schema.sql first (run it again in the Supabase SQL Editor).');
    }
    throw e;
  }
}

/** Download (or open) the stored receipt file. */
export async function downloadReceipt(r: Receipt) {
  if (!r.file_path) return;
  if (isDemo()) {
    const url = (await demoPhotoUrls([r.file_path]))[r.file_path];
    if (!url) throw new Error('This file is no longer in this browser.');
    if (Platform.OS === 'web') {
      const a = document.createElement('a');
      a.href = url;
      a.download = r.file_name ?? 'receipt';
      a.click();
    }
    return;
  }
  const { data, error } = await supabase.storage
    .from(RECEIPT_BUCKET)
    .createSignedUrl(r.file_path, 10 * 60, { download: r.file_name ?? true });
  if (error || !data) throw error ?? new Error('Could not create a download link.');
  if (Platform.OS === 'web') window.open(data.signedUrl, '_blank', 'noopener');
  else await Linking.openURL(data.signedUrl);
}

/** Link to show a receipt photo in the app (1 hour). */
export async function receiptPreviewUrl(r: Receipt) {
  if (!r.file_path || !r.mime_type?.startsWith('image/')) return null;
  if (isDemo()) return (await demoPhotoUrls([r.file_path]))[r.file_path] ?? null;
  const { data } = await supabase.storage.from(RECEIPT_BUCKET).createSignedUrl(r.file_path, 60 * 60);
  return data?.signedUrl ?? null;
}

/** Remove a receipt, its file and any draft lines still waiting (items already added stay). */
export async function deleteReceipt(r: Receipt) {
  const lines = linesStore.rows().filter((l) => l.receipt_id === r.id);
  await deleteRow(receiptsStore, r.id);
  for (const l of lines) linesStore.removeLocal(l.id);
  if (isDemo()) {
    const rest = (await readDemo<ReceiptLine[]>(DEMO_KEYS.receipt_items, [])).filter((l) => l.receipt_id !== r.id);
    await writeDemo(DEMO_KEYS.receipt_items, rest);
    if (r.file_path) await removeDemoPhoto(r.file_path);
  } else if (r.file_path) {
    await supabase.storage.from(RECEIPT_BUCKET).remove([r.file_path]);
  }
  for (const l of lines) await removePhotoIfUnused(l.photo_path).catch(() => {});
}

// ---- fuzzy photo suggestions ------------------------------------------------------------------------

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** On this device: items that have a photo (used in demo mode, or before the schema upgrade). */
function localMatches(names: string[], perName: number): PhotoMatch[][] {
  const seen = new Set<string>();
  const withPhoto = itemsStore.rows().filter((i) => i.photo_path && !seen.has(`${fold(i.name)}|${i.photo_path}`) && seen.add(`${fold(i.name)}|${i.photo_path}`));
  const fuse = new Fuse(withPhoto, { keys: ['name', 'product_name'], threshold: 0.4, includeScore: true, ignoreDiacritics: true, ignoreLocation: true });
  return names.map((n) => {
    const out: PhotoMatch[] = [];
    for (const r of n.trim().length >= 2 ? fuse.search(n, { limit: 20 }) : []) {
      if (out.some((m) => m.photo_path === r.item.photo_path)) continue;
      out.push({ name: r.item.name, photo_path: r.item.photo_path!, score: 1 - (r.score ?? 1) });
      if (out.length >= perName) break;
    }
    return out;
  });
}

/**
 * For each name, photos remembered for similar names (database fuzzy search with pg_trgm: typos, abbreviations and
 * missing accents still match). Best first.
 */
export async function suggestPhotos(names: string[], perName = 4): Promise<PhotoMatch[][]> {
  if (!names.length) return [];
  if (isDemo()) return localMatches(names, perName);
  const { data, error } = await supabase.rpc('match_photos', { names, per_name: perName, min_score: 0.3 });
  if (error) return localMatches(names, perName); // schema not upgraded yet, or offline
  const out: PhotoMatch[][] = names.map(() => []);
  for (const r of data as { query_index: number; name: string; photo_path: string; score: number }[]) {
    out[r.query_index - 1]?.push({ name: r.name, photo_path: r.photo_path, score: r.score });
  }
  return out;
}

// ---- import + bulk edit --------------------------------------------------------------------------------

const match = <T extends { id: string; label: string }>(list: T[], raw?: string) => {
  if (!raw) return undefined;
  const k = fold(raw);
  return (
    list.find((x) => fold(x.id) === k || fold(x.label) === k) ??
    list.find((x) => fold(x.label).startsWith(k) || k.startsWith(fold(x.label)))
  );
};
// Common words for the three default places.
const PLACE_WORDS: Record<string, string> = {
  frigorifico: 'fridge', frigo: 'fridge', geladeira: 'fridge', refrigerator: 'fridge',
  congelador: 'freezer', arca: 'freezer', frozen: 'freezer',
  despensa: 'emergency', pantry: 'emergency', emergencia: 'emergency', reserva: 'emergency', cupboard: 'emergency',
};

/** Turn parsed lines into drafts on a receipt (a new "list only" receipt when none is given). */
export async function importLines(
  receiptId: string | null,
  parsed: ParsedLine[],
  ctx: { places: Place[]; categories: Category[]; defaultPlace: Location; meta?: ReceiptMeta },
) {
  if (!parsed.length) throw new Error('No products found in that list.');
  const receipt = receiptId
    ? receiptsStore.rows().find((r) => r.id === receiptId)
    : await insertRow(receiptsStore, { title: `List of ${new Date().toLocaleDateString('pt-PT')}`, status: 'drafts', item_count: 0 });
  if (!receipt) throw new Error('That receipt was removed.');

  const suggestions = await suggestPhotos(parsed.map((p) => p.name), 1).catch(() => [] as PhotoMatch[][]);
  const existing = linesStore.rows().filter((l) => l.receipt_id === receipt.id);
  let sort = existing.reduce((m, l) => Math.max(m, l.sort), -1) + 1;

  const drafts: Partial<ReceiptLine>[] = parsed.map((p, i) => {
    const placeId =
      match(ctx.places, p.place)?.id ?? (p.place && PLACE_WORDS[fold(p.place)]) ?? ctx.defaultPlace;
    const exp = p.expires ? parseDateInput(p.expires) : null;
    const best = suggestions[i]?.[0];
    return {
      receipt_id: receipt.id,
      sort: sort++,
      name: p.name,
      amount: p.amount,
      location: ctx.places.some((x) => x.id === placeId) ? placeId : ctx.defaultPlace,
      category_id: match(ctx.categories, p.category)?.id ?? null,
      expires_on: exp && 'iso' in exp ? exp.iso : p.days != null && p.days >= 0 ? isoInDays(p.days) : null,
      notes: p.notes ?? null,
      // Same name as before: use its photo straight away (you can still change it). Similar names are only suggested.
      photo_path: best && fold(best.name) === fold(p.name) ? best.photo_path : null,
    };
  });
  await insertRows(linesStore, drafts);
  if (receipt.status !== 'drafts') await updateRow(receiptsStore, receipt.id, { status: 'drafts' });

  // Fill in what the list says about the purchase, without overwriting anything typed by hand.
  const priced = parsed.filter((p) => p.price != null);
  const total = ctx.meta?.totalCents ?? (priced.length ? priced.reduce((s, p) => s + (p.price ?? 0), 0) : null);
  const day = purchaseDate(ctx.meta?.date);
  const details: Partial<Receipt> = {};
  if (receipt.total_cents == null && total != null) details.total_cents = Math.min(total, 10000000);
  if (!receipt.purchased_on && day) details.purchased_on = day;
  if (!receipt.shop && ctx.meta?.shop) details.shop = ctx.meta.shop;
  if (Object.keys(details).length) await updateRow(receiptsStore, receipt.id, details).catch(() => {}); // schema not upgraded yet
  return receipt.id;
}

export async function addBlankLine(receiptId: string, location: Location) {
  const sort = linesStore.rows().filter((l) => l.receipt_id === receiptId).reduce((m, l) => Math.max(m, l.sort), -1) + 1;
  return insertRow(linesStore, { receipt_id: receiptId, sort, name: 'New item', amount: 1, location, category_id: null, expires_on: null, notes: null, photo_path: null });
}

export const updateLine = (line: ReceiptLine, patch: Partial<ReceiptLine>) => updateRow(linesStore, line.id, patch);

export async function removeLine(line: ReceiptLine) {
  await deleteRow(linesStore, line.id);
  await removePhotoIfUnused(line.photo_path).catch(() => {});
}

/** Save the checked lines as items (one request), then clear those drafts. Returns how many items were added. */
export async function saveLines(receipt: Receipt, lines: ReceiptLine[], fallbackPlace: Location) {
  const ok = lines.filter((l) => l.name.trim());
  const items: Partial<Item>[] = ok.map((l) => ({
    name: l.name.trim().slice(0, 200),
    amount: Math.max(0, Math.min(99999, Math.round(l.amount || 0))),
    location: l.location ?? fallbackPlace,
    expires_on: l.expires_on,
    photo_path: l.photo_path,
    notes: l.notes,
    ...(l.category_id ? { category_id: l.category_id } : {}),
    ...(isDemo() ? { added_by: 'demo' } : {}),
  }));
  await insertRows(itemsStore, items);
  const ids = lines.map((l) => l.id);
  if (isDemo()) {
    await writeDemo(DEMO_KEYS.receipt_items, (await readDemo<ReceiptLine[]>(DEMO_KEYS.receipt_items, [])).filter((l) => !ids.includes(l.id)));
  } else {
    const { error } = await supabase.from('receipt_items').delete().in('id', ids);
    if (error) throw error;
  }
  ids.forEach((id) => linesStore.removeLocal(id));
  const left = linesStore.rows().filter((l) => l.receipt_id === receipt.id).length;
  await updateRow(receiptsStore, receipt.id, { status: left ? 'drafts' : 'done', item_count: (receipt.item_count ?? 0) + items.length });
  return items.length;
}
