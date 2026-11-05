/** Portuguese supermarket chains, with the tag spellings Open Food Facts uses for them. */
export interface Store {
  key: string;
  label: string;
  color: string;
  domain: string; // official site: its icon is the chain's real logo
  aliases: string[];
}

export const PT_STORES: Store[] = [
  { key: 'continente', domain: 'continente.pt', label: 'Continente', color: '#E30613', aliases: ['continente', 'continente-bom-dia', 'continente-modelo', 'modelo-continente'] },
  { key: 'pingo-doce', domain: 'pingodoce.pt', label: 'Pingo Doce', color: '#5AA02C', aliases: ['pingo-doce', 'pingo doce', 'pingodoce'] },
  { key: 'lidl', domain: 'lidl.pt', label: 'Lidl', color: '#0050AA', aliases: ['lidl'] },
  { key: 'auchan', domain: 'auchan.pt', label: 'Auchan', color: '#D6001C', aliases: ['auchan', 'jumbo', 'pao-de-acucar'] },
  { key: 'intermarche', domain: 'intermarche.pt', label: 'Intermarché', color: '#C8102E', aliases: ['intermarche', 'intermarché', 'os-mosqueteiros'] },
  { key: 'mercadona', domain: 'mercadona.pt', label: 'Mercadona', color: '#00843D', aliases: ['mercadona', 'hacendado'] },
  { key: 'minipreco', domain: 'minipreco.pt', label: 'Minipreço', color: '#E2001A', aliases: ['minipreco', 'minipreço', 'dia'] },
  { key: 'aldi', domain: 'aldi.pt', label: 'Aldi', color: '#00005F', aliases: ['aldi'] },
  { key: 'el-corte-ingles', domain: 'elcorteingles.pt', label: 'El Corte Inglés', color: '#007A33', aliases: ['el-corte-ingles', 'el corte ingles'] },
];

const strip = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, '-');

/** Map free-form OFF store names/tags ("Pingo Doce", "en:continente") to our store keys. */
export function normaliseStores(raw: (string | null | undefined)[]): string[] {
  const out = new Set<string>();
  for (const r of raw) {
    if (!r) continue;
    for (const part of r.split(',')) {
      const t = strip(part.replace(/^[a-z]{2}:/, ''));
      if (!t) continue;
      const hit = PT_STORES.find((s) => s.aliases.some((a) => t === strip(a) || t.startsWith(strip(a))));
      if (hit) out.add(hit.key);
    }
  }
  return [...out];
}

/** Real logo, loaded on the device from the chain's own website icon and cached. */
export const storeLogoUrl = (s: Store) => `https://www.google.com/s2/favicons?domain=${s.domain}&sz=128`;

/** Store keys from a saved "Continente, Pingo Doce" label string. */
export const storesFromLabels = (labels: string | null) => normaliseStores(labels ? [labels] : []);

export const storeByKey = (key: string) => PT_STORES.find((s) => s.key === key);
export const storeLabels = (keys: string[]) => keys.map((k) => storeByKey(k)?.label ?? k).join(', ');
