/**
 * Supermarket shortcuts and per-item product links.
 *
 *  - Every chain has a website shortcut and, where the shop has a search page, a search for the item there.
 *  - An item can keep one product page per chain. When a link is saved the app reads that page (no AI: schema.org
 *    data, meta tags, labelled text, then Open Food Facts by EAN) and stores everything in `product_links`.
 *  - Android reads the page straight from the phone. The web app cannot (browsers block other sites' pages), so it
 *    asks the `fetch-product` Supabase Edge Function, which runs the same code. Android also falls back to it.
 */
import { Linking, Platform } from 'react-native';
import { FetchProductError, fetchProduct, storeForUrl, type ProductData } from '../../supabase/functions/fetch-product/extract';
import { DEMO_KEYS } from './demo';
import { isDemo } from './mode';
import { deleteRow, insertRow, tableStore, updateRow, useStore } from './store';
import { PT_STORES, storeByKey, storeLabels, storesFromLabels } from './stores';
import { supabase } from './supabase';
import type { Item, ItemDraft, ProductLink } from './types';

export { storeForUrl };

/** Home page and product search of each chain. Search is null where the shop has no public product search. */
const SHOP_PAGES: Record<string, { home: string; search: ((q: string) => string) | null }> = {
  continente: { home: 'https://www.continente.pt/', search: (q) => `https://www.continente.pt/pesquisa/?q=${q}` },
  'pingo-doce': { home: 'https://www.pingodoce.pt/', search: null },
  lidl: { home: 'https://www.lidl.pt/', search: (q) => `https://www.lidl.pt/q/search?q=${q}` },
  auchan: { home: 'https://www.auchan.pt/', search: (q) => `https://www.auchan.pt/pt/pesquisa?q=${q}` },
  intermarche: { home: 'https://lojaonline.intermarche.pt/', search: null },
  mercadona: { home: 'https://www.mercadona.pt/', search: null },
  minipreco: { home: 'https://www.minipreco.pt/', search: null },
  aldi: { home: 'https://www.aldi.pt/', search: null },
  'el-corte-ingles': { home: 'https://www.elcorteingles.pt/supermercado/', search: (q) => `https://www.elcorteingles.pt/supermercado/pesquisar/?term=${q}` },
};

export const shopHome = (store: string) => SHOP_PAGES[store]?.home ?? `https://www.${storeByKey(store)?.domain ?? ''}/`;

/** Search for `query` at that shop; shops without a search page get a web search limited to their site. */
export function shopSearchUrl(store: string, query: string): string {
  const q = encodeURIComponent(query.trim());
  if (!q) return shopHome(store);
  const search = SHOP_PAGES[store]?.search;
  if (search) return search(q);
  const domain = storeByKey(store)?.domain;
  return domain ? `https://www.google.com/search?q=${encodeURIComponent(`site:${domain} ${query.trim()}`)}` : shopHome(store);
}

export const openUrl = (url: string) => Linking.openURL(url).catch(() => {});
export const openShop = (store: string) => openUrl(shopHome(store));

/** What to search for an item: product name if known, plus brand. */
export const itemQuery = (item: Pick<Item, 'name' | 'product_name' | 'brand'>) => {
  const name = item.product_name || item.name;
  return item.brand && !name.toLowerCase().includes(item.brand.toLowerCase()) ? `${name} ${item.brand}` : name;
};

// ---- stored links -------------------------------------------------------------------------------------------

export const linksStore = tableStore<ProductLink>({
  table: 'product_links',
  demoKey: DEMO_KEYS.links,
  sort: (a, b) => a.created_at.localeCompare(b.created_at),
});

export function useItemLinks(itemId: string | undefined) {
  const { rows, loading } = useStore(linksStore);
  return { links: itemId ? rows.filter((l) => l.item_id === itemId) : [], loading };
}

/** Store keys that have a saved product page, per item id. */
export function useLinkedStores() {
  const { rows } = useStore(linksStore);
  const map = new Map<string, string[]>();
  for (const l of rows) map.set(l.item_id, [...(map.get(l.item_id) ?? []), l.store]);
  return map;
}

export function normaliseUrl(raw: string): string | null {
  const text = raw.trim();
  const found = /https?:\/\/\S+/i.exec(text)?.[0] ?? (/^[\w.-]+\.[a-z]{2,}\//i.test(text) ? `https://${text}` : null);
  if (!found) return null;
  try {
    const u = new URL(found.replace(/^http:/i, 'https:'));
    u.hash = '';
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|gclid|fbclid|srsltid)/i.test(k)) u.searchParams.delete(k);
    return u.toString();
  } catch {
    return null;
  }
}

/** Read the product page: on the phone directly, on the web (or when the phone is blocked) via the server. */
export async function readProductPage(url: string): Promise<ProductData> {
  let localError: Error | null = null;
  if (Platform.OS !== 'web') {
    try {
      return await fetchProduct(url);
    } catch (e) {
      localError = e as Error;
    }
  }
  if (isDemo()) throw localError ?? new Error('The web demo cannot read shop pages: sign in (the server reads them) or use the Android app.');
  const { data, error } = await supabase.functions.invoke('fetch-product', { body: { url } });
  if (error) {
    let message = error.message;
    try {
      const body = await (error as { context?: Response }).context?.json();
      if (body?.error) message = body.error;
    } catch {
      /* keep the generic message */
    }
    if (/not found|404|Failed to send/i.test(message) && !/shop|page/i.test(message))
      message = 'The "fetch-product" server function is not set up yet (see README → Product links).';
    throw new FetchProductError(localError ? `${localError.message} The server could not read it either: ${message}` : message);
  }
  return (data as { data: ProductData }).data;
}

const columns = (d: ProductData) => ({
  name: d.name,
  brand: d.brand,
  ean: d.ean,
  price: d.price,
  currency: d.currency,
  unit_price: d.unit_price,
  quantity: d.quantity,
  image_url: d.image_url,
});

/** Save (or replace) the item's product page at that shop, then read it. Returns the stored link. */
export async function saveLink(item: Item, rawUrl: string): Promise<ProductLink> {
  const url = normaliseUrl(rawUrl);
  if (!url) throw new Error('That does not look like a web link.');
  const store = storeForUrl(url);
  if (!store) throw new Error(`Paste a product page from ${PT_STORES.map((s) => s.label).join(', ')}.`);
  const existing = linksStore.rows().find((l) => l.item_id === item.id && l.store === store);
  const base = { url, status: 'pending' as const, error: null };
  const link = existing ? await updateRow(linksStore, existing.id, base) : await insertRow(linksStore, { item_id: item.id, store, ...base });
  return refreshLink(link);
}

/** (Re)read the page and store all the data on the link. A failure is stored too, so it shows on both devices. */
export async function refreshLink(link: ProductLink): Promise<ProductLink> {
  try {
    const d = await readProductPage(link.url);
    return await updateRow(linksStore, link.id, { ...columns(d), data: d, status: 'ok', error: null, fetched_at: d.fetched_at });
  } catch (e) {
    return await updateRow(linksStore, link.id, { status: 'failed', error: (e as Error).message.slice(0, 500), fetched_at: new Date().toISOString() });
  }
}

export const removeLink = (link: ProductLink) => deleteRow(linksStore, link.id);

/** Item fields that the product page can fill in. Only empty fields are filled unless `overwrite`. */
export function itemPatchFromLink(item: Item, link: ProductLink, overwrite = false): Partial<ItemDraft> {
  const d = link.data;
  if (!d) return {};
  const patch: Partial<ItemDraft> = {};
  const set = <K extends keyof ItemDraft>(k: K, v: ItemDraft[K] | null | undefined) => {
    if (v == null || v === '') return;
    if (overwrite || item[k] == null || item[k] === '') patch[k] = v;
  };
  set('product_name', d.name);
  set('brand', d.brand);
  set('barcode', d.ean);
  set('quantity', d.quantity);
  set('off_image_url', d.image_url);
  set('nutriscore', d.nutriscore);
  set('nova_group', d.nova_group);
  set('kcal_100g', d.nutrition?.energy_kcal != null ? Math.round(d.nutrition.energy_kcal) : null);
  const stores = storesFromLabels(item.stores);
  if (!stores.includes(link.store)) patch.stores = storeLabels([...stores, link.store]);
  return patch;
}

export const formatPrice = (price: number | null, currency: string | null) =>
  price == null ? null : `${price.toFixed(2).replace('.', ',')} ${currency && currency !== 'EUR' ? currency : '€'}`;
