/**
 * Product data from a Portuguese supermarket product page. No AI: only what the page itself publishes.
 *
 * Shared, dependency-free code: the Android app runs it on the phone (no CORS there), and the
 * `fetch-product` Supabase Edge Function runs the same file for the web app (browsers block cross-site pages).
 *
 * Sources, best first, merged field by field:
 *  1. schema.org JSON-LD (`<script type="application/ld+json">` @type Product): name, brand, GTIN/EAN, price…
 *  2. schema.org microdata (`itemprop="…"`) and OpenGraph / product meta tags
 *  3. Lidl's public search JSON (Lidl product pages render on the client)
 *  4. Labelled text on the page: "EAN", "Ingredientes", "Informação nutricional", "Nutri-Score", "€/kg"…
 *  5. Open Food Facts, looked up by the EAN found above: Nutri-Score, NOVA, nutrition, ingredients, allergens
 */

export interface Nutrition {
  energy_kj?: number;
  energy_kcal?: number;
  fat?: number;
  saturated_fat?: number;
  carbohydrates?: number;
  sugars?: number;
  fiber?: number;
  proteins?: number;
  salt?: number;
}

export interface ProductData {
  store: string | null;
  url: string;
  name: string | null;
  brand: string | null;
  description: string | null;
  ean: string | null;
  sku: string | null;
  price: number | null;
  currency: string | null;
  /** e.g. "0,85 €/L" as the shop shows it */
  unit_price: string | null;
  regular_price: number | null;
  quantity: string | null;
  image_url: string | null;
  images: string[];
  availability: string | null;
  category: string | null;
  ingredients: string | null;
  allergens: string | null;
  origin: string | null;
  storage: string | null;
  /** per 100 g / 100 ml */
  nutrition: Nutrition | null;
  nutrition_text: string | null;
  nutriscore: 'a' | 'b' | 'c' | 'd' | 'e' | null;
  nova_group: number | null;
  rating: number | null;
  rating_count: number | null;
  /** where the data came from: jsonld, microdata, meta, lidl-api, page-text, openfoodfacts */
  sources: string[];
  fetched_at: string;
}

/** Shops we fetch from (and the only hosts the server function will contact). */
export const STORE_HOSTS: Record<string, string[]> = {
  continente: ['continente.pt'],
  'pingo-doce': ['pingodoce.pt'],
  lidl: ['lidl.pt'],
  auchan: ['auchan.pt'],
  intermarche: ['intermarche.pt'],
  mercadona: ['mercadona.pt', 'mercadona.es'],
  minipreco: ['minipreco.pt', 'dia.pt'],
  aldi: ['aldi.pt'],
  'el-corte-ingles': ['elcorteingles.pt'],
};
const OFF_HOSTS = ['openfoodfacts.org'];

const hostMatches = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

/** Store key for a link ("https://www.continente.pt/produto/…" → "continente"), or null for other sites. */
export function storeForUrl(raw: string): string | null {
  try {
    const host = new URL(raw).hostname.toLowerCase();
    for (const [key, domains] of Object.entries(STORE_HOSTS)) if (domains.some((d) => hostMatches(host, d))) return key;
  } catch {
    /* not a URL */
  }
  return null;
}

export function isAllowedUrl(raw: string, extra: string[] = OFF_HOSTS): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return false;
    const host = u.hostname.toLowerCase();
    return storeForUrl(raw) !== null || extra.some((d) => hostMatches(host, d));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// small helpers

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', euro: '€', ordm: 'º', ordf: 'ª' };
export function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    const lower = e.toLowerCase();
    if (lower in ENTITIES) return ENTITIES[lower];
    // Latin-1 letters used in Portuguese: &aacute; &ccedil; &atilde; …
    const acc = /^([a-z])(acute|grave|circ|tilde|uml|cedil)$/i.exec(e);
    if (acc) {
      const mark = { acute: '́', grave: '̀', circ: '̂', tilde: '̃', uml: '̈', cedil: '̧' }[acc[2].toLowerCase() as 'acute'];
      return (acc[1] + mark).normalize('NFC');
    }
    return m;
  });
}

const clean = (s: unknown, max = 2000): string | null => {
  if (s == null) return null;
  const t = decodeEntities(String(s)).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : null;
};

/** "1.234,56" / "1,29" / "1.29" / 1.29 → 1.29 */
export function parseNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const m = /-?\d[\d.,\s]*/.exec(v);
  if (!m) return null;
  let s = m[0].replace(/\s/g, '');
  if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (s.includes(',')) s = s.replace(',', '.');
  s = s.replace(/[.,]$/, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** EAN-8/12/13/14 check digit. */
export function validGtin(code: string): boolean {
  if (!/^\d{8}$|^\d{12,14}$/.test(code)) return false;
  const digits = code.split('').map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

const asArray = <T>(v: T | T[] | null | undefined): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);
const typeIs = (o: Record<string, unknown>, t: string) => asArray(o['@type'] as string | string[]).some((x) => String(x).toLowerCase() === t.toLowerCase());
const nameOf = (v: unknown): string | null =>
  typeof v === 'string' ? clean(v, 200) : v && typeof v === 'object' ? clean((v as Record<string, unknown>).name, 200) : null;
const imageOf = (v: unknown): string[] =>
  asArray(v as unknown[]).flatMap((x) => (typeof x === 'string' ? [x] : x && typeof x === 'object' ? asArray((x as Record<string, unknown>).url as string) : [])).filter((x): x is string => typeof x === 'string');

function absolute(url: string | null | undefined, base: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(decodeEntities(url.trim()), base);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

const QTY = /(\d+\s*[x×]\s*)?\d+(?:[.,]\d+)?\s*(?:kg|g|gr|mg|l|lt|ml|cl|dl|un|unid|uds)\b\.?/i;
const quantityFrom = (s: string | null) => (s ? QTY.exec(s)?.[0].replace(/\s+/g, ' ').trim() ?? null : null);

// ---------------------------------------------------------------------------------------------------------------
// 1. JSON-LD

function jsonLdNodes(html: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const re = /<script[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;
  for (let m; (m = re.exec(html)); ) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(m[1].trim());
    } catch {
      try {
        parsed = JSON.parse(m[1].trim().replace(/[\u0000-\u001f]+/g, ' '));
      } catch {
        continue;
      }
    }
    const walk = (v: unknown) => {
      if (Array.isArray(v)) return v.forEach(walk);
      if (!v || typeof v !== 'object') return;
      const o = v as Record<string, unknown>;
      out.push(o);
      if (o['@graph']) walk(o['@graph']);
      if (o.mainEntity) walk(o.mainEntity);
      if (o.itemListElement) walk(o.itemListElement);
    };
    walk(parsed);
  }
  return out;
}

const NUTRITION_KEYS: [keyof Nutrition, string][] = [
  ['energy_kcal', 'calories'],
  ['fat', 'fatContent'],
  ['saturated_fat', 'saturatedFatContent'],
  ['carbohydrates', 'carbohydrateContent'],
  ['sugars', 'sugarContent'],
  ['fiber', 'fiberContent'],
  ['proteins', 'proteinContent'],
  ['salt', 'sodiumContent'],
];

function fromJsonLd(html: string, url: string): Partial<ProductData> {
  const nodes = jsonLdNodes(html);
  const p = nodes.find((n) => typeIs(n, 'Product')) as Record<string, unknown> | undefined;
  const out: Partial<ProductData> = {};
  const crumbs = nodes.find((n) => typeIs(n, 'BreadcrumbList'));
  if (crumbs) {
    const names = asArray(crumbs.itemListElement as Record<string, unknown>[])
      .map((e) => nameOf(e?.item) ?? nameOf(e))
      .filter(Boolean);
    if (names.length) out.category = names.join(' › ');
  }
  if (!p) return out;
  out.name = clean(p.name, 300);
  out.brand = nameOf(p.brand) ?? nameOf(p.manufacturer);
  out.description = clean(p.description);
  for (const k of ['gtin13', 'gtin', 'gtin14', 'gtin12', 'gtin8', 'ean', 'isbn']) {
    const v = String(p[k] ?? '').replace(/\D/g, '');
    if (v && validGtin(v)) {
      out.ean = v.length === 14 && v.startsWith('0') ? v.slice(1) : v;
      break;
    }
  }
  out.sku = clean(p.sku ?? p.productID ?? p.mpn, 60);
  out.images = imageOf(p.image).map((i) => absolute(i, url)).filter((x): x is string => !!x);
  out.image_url = out.images[0] ?? null;
  if (typeof p.category === 'string' && !out.category) out.category = clean(p.category, 300);
  const size = nameOf(p.size) ?? clean((p.weight as Record<string, unknown>)?.value ? `${(p.weight as Record<string, unknown>).value} ${(p.weight as Record<string, unknown>).unitText ?? (p.weight as Record<string, unknown>).unitCode ?? ''}` : null, 40);
  if (size) out.quantity = size;
  const offers = asArray(p.offers as Record<string, unknown> | Record<string, unknown>[]).flatMap((o) =>
    o && typeIs(o, 'AggregateOffer') && o.offers ? asArray(o.offers as Record<string, unknown>[]) : [o],
  );
  const offer = offers.find((o) => o && (o.price != null || o.lowPrice != null || o.priceSpecification));
  if (offer) {
    const spec = asArray(offer.priceSpecification as Record<string, unknown>[])[0];
    out.price = parseNumber(offer.price ?? offer.lowPrice ?? spec?.price);
    out.currency = clean(offer.priceCurrency ?? spec?.priceCurrency, 8);
    out.availability = clean(String(offer.availability ?? '').replace(/^https?:\/\/schema\.org\//, ''), 40);
  }
  const rating = p.aggregateRating as Record<string, unknown> | undefined;
  if (rating) {
    out.rating = parseNumber(rating.ratingValue);
    out.rating_count = parseNumber(rating.reviewCount ?? rating.ratingCount);
  }
  const n = p.nutrition as Record<string, unknown> | undefined;
  if (n) {
    const nut: Nutrition = {};
    for (const [key, ld] of NUTRITION_KEYS) {
      const v = parseNumber(n[ld]);
      if (v == null) continue;
      if (key === 'salt') nut.salt = /mg/i.test(String(n[ld])) ? (v / 1000) * 2.5 : v * 2.5; // sodium → salt
      else nut[key] = v;
    }
    if (Object.keys(nut).length) out.nutrition = nut;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// 2. microdata + meta tags

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
  return m ? decodeEntities(m[1] ?? m[2] ?? m[3] ?? '') : null;
}

function metaTags(html: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const key = (attr(m[0], 'property') ?? attr(m[0], 'name') ?? attr(m[0], 'itemprop'))?.toLowerCase();
    const content = attr(m[0], 'content');
    if (key && content && !map.has(key)) map.set(key, content.trim());
  }
  return map;
}

function itemprop(html: string, prop: string): string | null {
  const re = new RegExp(`<([a-z0-9]+)\\b[^>]*\\sitemprop\\s*=\\s*["']?${prop}["']?[^>]*>`, 'i');
  const m = re.exec(html);
  if (!m) return null;
  const content = attr(m[0], 'content') ?? attr(m[0], 'src') ?? attr(m[0], 'href');
  if (content) return content;
  const close = html.indexOf(`</${m[1]}`, m.index + m[0].length);
  return close > 0 ? clean(html.slice(m.index + m[0].length, Math.min(close, m.index + m[0].length + 2000)), 500) : null;
}

function fromMeta(html: string, url: string): Partial<ProductData> {
  const meta = metaTags(html);
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  const out: Partial<ProductData> = {};
  out.name = clean(itemprop(html, 'name') && /itemtype\s*=\s*["']?https?:\/\/schema\.org\/Product/i.test(html) ? itemprop(html, 'name') : null, 300)
    ?? clean((meta.get('og:title') ?? title ?? '').replace(/\s*[|–-]\s*(continente|pingo doce|lidl|auchan|intermarch[ée]|mercadona|minipre[çc]o|aldi|el corte ingl[ée]s)[^|]*$/i, '').replace(/^[^|]*\|\s*(?=.*\|)/, ''), 300);
  out.brand = clean(meta.get('product:brand') ?? meta.get('og:brand') ?? itemprop(html, 'brand'), 120);
  out.description = clean(meta.get('og:description') ?? meta.get('description'));
  const img = absolute(meta.get('og:image') ?? meta.get('og:image:secure_url') ?? meta.get('twitter:image') ?? itemprop(html, 'image'), url);
  if (img) {
    out.image_url = img;
    out.images = [img];
  }
  out.price = parseNumber(meta.get('product:price:amount') ?? meta.get('og:price:amount') ?? itemprop(html, 'price'));
  out.currency = clean(meta.get('product:price:currency') ?? meta.get('og:price:currency') ?? itemprop(html, 'priceCurrency'), 8);
  out.sku = clean(meta.get('product:retailer_item_id') ?? itemprop(html, 'sku') ?? itemprop(html, 'productID'), 60);
  for (const k of ['gtin13', 'gtin', 'gtin14', 'gtin8']) {
    const v = (itemprop(html, k) ?? meta.get(`product:${k}`) ?? '').replace(/\D/g, '');
    if (v && validGtin(v)) {
      out.ean = v;
      break;
    }
  }
  out.availability = clean(meta.get('product:availability') ?? meta.get('og:availability'), 40);
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// 4. labelled text on the page

/** Visible text with one line per block element, scripts and styles removed. */
export function pageText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(br|\/p|\/div|\/li|\/tr|\/h[1-6]|\/dt|\/dd|\/section|\/table|\/ul|\/span)\b[^>]*>/gi, '\n')
      .replace(/<\/t[dh]>/gi, ' \t ')
      .replace(/<[^>]+>/g, ' '),
  )
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

const HEADINGS: [keyof ProductData | 'nutrition', RegExp][] = [
  ['ingredients', /^(lista de )?ingredientes?( e composi[çc][ãa]o)?\s*:?$|^composi[çc][ãa]o\s*:?$/i],
  ['nutrition', /^(informa[çc](ão|ões) nutriciona(l|is)|valores? nutriciona(l|is)|tabela nutricional|declara[çc][ãa]o nutricional)( m[ée]dios?)?\s*:?$/i],
  ['allergens', /^(al[ée]rg[ée]nios|alergias|informa[çc][ãa]o sobre al[ée]rg[ée]nios)\s*:?$/i],
  ['origin', /^(origem|pa[ií]s de origem)\s*:?$/i],
  ['storage', /^(conserva[çc][ãa]o|modo de conserva[çc][ãa]o|condi[çc][õo]es de conserva[çc][ãa]o)\s*:?$/i],
  ['description', /^(descri[çc][ãa]o( do produto)?|detalhes do produto)\s*:?$/i],
];
const ANY_HEADING = /^(ingredientes|informa[çc]|valores? nutri|tabela nutri|declara[çc][ãa]o nutri|al[ée]rg|origem|pa[ií]s de origem|conserva|modo de|descri[çc]|denomina|nome e morada|nutri-?score|caracter[ií]sticas|detalhes|utiliza[çc]|prepara[çc]|ref\.|refer[êe]ncia|ean\b|marca\b|quantidade|peso|validade|avalia[çc]|produtos relacionados|tamb[ée]m|quem comprou)/i;

const isHeading = (l: string) => l.length < 45 && l.split(' ').length <= 5 && !/[.;,]$/.test(l) && ANY_HEADING.test(l);

function sections(text: string): Partial<Record<string, string>> {
  const lines = text.split('\n');
  const out: Partial<Record<string, string>> = {};
  lines.forEach((line, i) => {
    // "Ingredientes: leite, açúcar" on one line, or a heading followed by its text
    for (const [key, re] of HEADINGS) {
      if (out[key]) continue;
      const inline = /^([^:]{3,45}):\s*(.+)$/.exec(line);
      if (inline && re.test(`${inline[1].trim()}`)) {
        out[key] = inline[2].slice(0, 1500);
        continue;
      }
      if (!re.test(line)) continue;
      const body: string[] = [];
      for (let j = i + 1; j < lines.length && body.join(' ').length < 1500; j++) {
        if (isHeading(lines[j])) break;
        body.push(lines[j]);
        if (key !== 'nutrition' && key !== 'description' && body.length >= 3) break;
      }
      if (body.length) out[key] = body.join(key === 'nutrition' ? '\n' : ' ').slice(0, 1500);
    }
  });
  return out;
}

const NUT_PATTERNS: [keyof Nutrition, RegExp][] = [
  ['energy_kj', /(\d+(?:[.,]\d+)?)\s*kj/i],
  ['energy_kcal', /(\d+(?:[.,]\d+)?)\s*kcal/i],
  ['saturated_fat', /saturad[oa]s?[^0-9<]{0,25}(\d+(?:[.,]\d+)?)\s*g/i],
  ['fat', /(?:l[ií]pidos|gordura(?:s)?(?: total)?|mat[ée]ria gorda)[^0-9<]{0,25}(\d+(?:[.,]\d+)?)\s*g/i],
  ['sugars', /a[çc][úu]car(?:es)?[^0-9<]{0,25}(\d+(?:[.,]\d+)?)\s*g/i],
  ['carbohydrates', /hidratos de carbono[^0-9<]{0,25}(\d+(?:[.,]\d+)?)\s*g/i],
  ['fiber', /fibras?(?: alimentar(?:es)?)?[^0-9<]{0,25}(\d+(?:[.,]\d+)?)\s*g/i],
  ['proteins', /prote[ií]nas?[^0-9<]{0,25}(\d+(?:[.,]\d+)?)\s*g/i],
  ['salt', /\bsal\b[^0-9<]{0,25}(\d+(?:[.,]\d+)?)\s*g/i],
];

export function parseNutrition(text: string): Nutrition | null {
  const nut: Nutrition = {};
  for (const [key, re] of NUT_PATTERNS) {
    const m = re.exec(text);
    const v = m ? parseNumber(m[1]) : null;
    if (v != null) nut[key] = v;
  }
  if (nut.energy_kcal == null && nut.energy_kj != null) nut.energy_kcal = Math.round(nut.energy_kj / 4.184);
  return Object.keys(nut).length >= 2 ? nut : null;
}

function fromText(html: string): Partial<ProductData> {
  const text = pageText(html);
  const out: Partial<ProductData> = {};
  // EAN: a valid GTIN within a few characters of an EAN / barcode label (Auchan: "Ref. / EAN: 3010403 5601002113979")
  for (const m of text.matchAll(/(?:\bEAN\b|\bGTIN\b|c[óo]digo de barras|c[óo]digo EAN)[^\n]{0,40}/gi)) {
    const code = (m[0].match(/\b\d{8,14}\b/g) ?? []).find(validGtin);
    if (code) {
      out.ean = code;
      break;
    }
  }
  const s = sections(text);
  out.ingredients = clean(s.ingredients, 1500);
  out.allergens = clean(s.allergens, 500);
  out.origin = clean(s.origin, 120);
  out.storage = clean(s.storage, 400);
  out.description = clean(s.description);
  const nutText = s.nutrition ?? /valores nutricionais[\s\S]{0,600}/i.exec(text)?.[0] ?? null;
  if (nutText) {
    out.nutrition_text = clean(nutText, 1200);
    out.nutrition = parseNutrition(nutText);
  }
  const ns = /nutri-?\s?score\s*:?\s*\n?\s*([A-E])\b/i.exec(text) ?? /nutri-?score[-_ ]?([a-e])\.(?:svg|png)/i.exec(html);
  if (ns) out.nutriscore = ns[1].toLowerCase() as ProductData['nutriscore'];
  const unit = /\d+[.,]\d{2}\s*€\s*\/\s*(?:kg|kgm|lt|l|un|unid|ml|g|dz|m)\b/i.exec(text);
  if (unit) out.unit_price = unit[0].replace(/\s+/g, ' ');
  const brand = /^marca\s*:?\s*(.{2,40})$/im.exec(text);
  if (brand) out.brand = clean(brand[1], 80);
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// 3. Lidl: product pages are drawn by JavaScript, but the search JSON carries the data

const LIDL_PATH = /\/p\/[^/]+\/p(\d+)/;
export const lidlApiUrl = (url: string) => {
  const erp = LIDL_PATH.exec(new URL(url).pathname)?.[1];
  return erp ? `https://www.lidl.pt/q/api/search?q=${erp}&locale=pt_PT&assortment=PT&version=v2.0.0` : null;
};

export function fromLidlApi(json: unknown, url: string): Partial<ProductData> {
  const erp = LIDL_PATH.exec(new URL(url).pathname)?.[1];
  let hit: Record<string, unknown> | null = null;
  let around: unknown[] = []; // the search result that holds it (the EAN sits in a sibling "meta" object)
  const walk = (v: unknown, parents: unknown[]) => {
    if (hit || parents.length > 8 || !v || typeof v !== 'object') return;
    if (Array.isArray(v)) return v.forEach((x) => walk(x, [...parents, v]));
    const o = v as Record<string, unknown>;
    if (String(o.erpNumber ?? o.productId ?? '') === erp && (o.fullTitle || o.title)) {
      hit = o;
      around = parents.slice(-2);
    } else Object.values(o).forEach((x) => walk(x, [...parents, o]));
  };
  walk(json, []);
  if (!hit) return {};
  const o = hit as Record<string, unknown>;
  const price = (o.price ?? {}) as Record<string, unknown>;
  let ean: string | null = null;
  const findEan = (v: unknown, d = 0) => {
    if (ean || d > 4 || !v || typeof v !== 'object') return;
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (/^eans?$/i.test(k)) {
        const c = asArray(x as string[]).map(String).find((c) => validGtin(c));
        if (c) ean = c;
      } else findEan(x, d + 1);
    }
  };
  findEan(o);
  for (const p of around.reverse()) if (!Array.isArray(p)) findEan(p);
  const img = typeof o.image === 'string' ? o.image : null;
  return {
    name: clean(o.fullTitle ?? o.title, 300),
    brand: nameOf(o.brand),
    ean,
    sku: clean(o.erpNumber, 40),
    price: parseNumber(price.price ?? o.price),
    regular_price: parseNumber(price.oldPrice ?? price.recommendedPrice),
    currency: 'EUR',
    unit_price: clean((price.basePrice as Record<string, unknown>)?.text ?? price.basePrice, 60),
    image_url: img,
    images: img ? [img] : [],
    category: clean(o.category, 200),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// 5. Open Food Facts by EAN

const OFF_FIELDS = 'product_name,product_name_pt,brands,quantity,nutriscore_grade,nova_group,nutriments,ingredients_text_pt,ingredients_text,allergens_tags,image_front_url,origins,categories';

export function fromOff(p: Record<string, unknown>): Partial<ProductData> {
  const n = (p.nutriments ?? {}) as Record<string, unknown>;
  const num = (k: string) => parseNumber(n[k]);
  const nut: Nutrition = {};
  const pairs: [keyof Nutrition, string][] = [
    ['energy_kj', 'energy-kj_100g'], ['energy_kcal', 'energy-kcal_100g'], ['fat', 'fat_100g'], ['saturated_fat', 'saturated-fat_100g'],
    ['carbohydrates', 'carbohydrates_100g'], ['sugars', 'sugars_100g'], ['fiber', 'fiber_100g'], ['proteins', 'proteins_100g'], ['salt', 'salt_100g'],
  ];
  for (const [k, off] of pairs) {
    const v = num(off);
    if (v != null) nut[k] = Math.round(v * 100) / 100;
  }
  const grade = String(p.nutriscore_grade ?? '').toLowerCase();
  const allergens = asArray(p.allergens_tags as string[]).map((a) => a.replace(/^[a-z]{2}:/, '').replace(/-/g, ' ')).join(', ');
  return {
    name: clean(p.product_name_pt ?? p.product_name, 300),
    brand: clean(String(p.brands ?? '').split(',')[0], 120),
    quantity: clean(p.quantity, 40),
    nutriscore: /^[a-e]$/.test(grade) ? (grade as ProductData['nutriscore']) : null,
    nova_group: typeof p.nova_group === 'number' ? p.nova_group : null,
    nutrition: Object.keys(nut).length ? nut : null,
    ingredients: clean(p.ingredients_text_pt ?? p.ingredients_text, 1500),
    allergens: allergens || null,
    origin: clean(p.origins, 120),
    image_url: clean(p.image_front_url, 500),
    category: clean(p.categories, 300),
  };
}

// ---------------------------------------------------------------------------------------------------------------

const EMPTY = (url: string): ProductData => ({
  store: storeForUrl(url), url, name: null, brand: null, description: null, ean: null, sku: null, price: null, currency: null,
  unit_price: null, regular_price: null, quantity: null, image_url: null, images: [], availability: null, category: null,
  ingredients: null, allergens: null, origin: null, storage: null, nutrition: null, nutrition_text: null, nutriscore: null,
  nova_group: null, rating: null, rating_count: null, sources: [], fetched_at: new Date().toISOString(),
});

/** Fill only what is still missing: earlier (more reliable) sources win. */
function merge(target: ProductData, part: Partial<ProductData>, source: string) {
  let used = false;
  for (const [k, v] of Object.entries(part) as [keyof ProductData, unknown][]) {
    if (v == null || v === '' || (Array.isArray(v) && !v.length)) continue;
    const cur = target[k];
    if (k === 'nutrition' && cur && typeof cur === 'object') {
      const add = Object.fromEntries(Object.entries(v as Nutrition).filter(([nk]) => (cur as Nutrition)[nk as keyof Nutrition] == null));
      if (Object.keys(add).length) {
        Object.assign(cur, add);
        used = true;
      }
      continue;
    }
    if (cur == null || (Array.isArray(cur) && !cur.length)) {
      (target as unknown as Record<string, unknown>)[k] = v;
      used = true;
    }
  }
  if (used && !target.sources.includes(source)) target.sources.push(source);
}

/** Everything that can be read from one product page's HTML (no network). */
export function extractFromHtml(html: string, url: string): ProductData {
  const data = EMPTY(url);
  merge(data, fromJsonLd(html, url), 'jsonld');
  merge(data, fromMeta(html, url), 'meta');
  merge(data, fromText(html), 'page-text');
  finish(data);
  return data;
}

function finish(data: ProductData) {
  if (!data.quantity) data.quantity = quantityFrom(data.name);
  if (data.price != null && !data.currency) data.currency = 'EUR';
  if (data.name && data.brand && data.name.toLowerCase() === data.brand.toLowerCase()) data.brand = null;
  data.images = [...new Set(data.images)].slice(0, 8);
  if (!data.image_url) data.image_url = data.images[0] ?? null;
}

export const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'pt-PT,pt;q=0.9,en;q=0.6',
};

export class FetchProductError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.status = status;
  }
}

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * Fetch a product page and pull out everything it publishes, then enrich it from Open Food Facts by EAN.
 * `fetcher` lets the server function enforce its own redirect / host rules.
 */
export async function fetchProduct(url: string, opts: { fetcher?: Fetcher; timeoutMs?: number } = {}): Promise<ProductData> {
  if (!isAllowedUrl(url, [])) throw new FetchProductError('Only https links to the supported supermarkets can be read.');
  const doFetch: Fetcher = opts.fetcher ?? ((u, init) => fetch(u, init));
  const timed = async (u: string, init: RequestInit) => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 15000);
    try {
      return await doFetch(u, { ...init, signal: ctl.signal });
    } finally {
      clearTimeout(timer);
    }
  };

  let data = EMPTY(url);
  let pageError: FetchProductError | null = null;
  try {
    const res = await timed(url, { headers: BROWSER_HEADERS });
    if (!res.ok) throw new FetchProductError(res.status === 403 || res.status === 429 ? `The shop refused the request (${res.status}: bot protection).` : `The shop answered ${res.status}.`, res.status);
    const html = (await res.text()).slice(0, 3_000_000);
    if (/captcha|cf-chl|_Incapsula_|px-captcha|Access Denied/i.test(html.slice(0, 20000)) && !/application\/ld\+json/i.test(html))
      throw new FetchProductError('The shop showed a bot check instead of the product page.', 403);
    data = extractFromHtml(html, url);
  } catch (e) {
    pageError = e instanceof FetchProductError ? e : new FetchProductError(`Could not load the page: ${(e as Error).message}`);
  }

  const lidl = data.store === 'lidl' ? lidlApiUrl(url) : null;
  if (lidl) {
    try {
      const res = await timed(lidl, { headers: { ...BROWSER_HEADERS, Accept: 'application/json' } });
      if (res.ok) merge(data, fromLidlApi(await res.json(), url), 'lidl-api');
    } catch {
      /* optional */
    }
  }

  if (data.ean) {
    try {
      const res = await timed(`https://world.openfoodfacts.org/api/v2/product/${data.ean}.json?fields=${OFF_FIELDS}`, {
        headers: { 'User-Agent': 'FridgeTrackerPersonal/1.0 (personal use app)', Accept: 'application/json' },
      });
      const json = res.ok ? await res.json() : null;
      if (json?.status === 1 && json.product) merge(data, fromOff(json.product), 'openfoodfacts');
    } catch {
      /* optional */
    }
  }

  finish(data);
  if (!data.name && !data.price && !data.ean) throw pageError ?? new FetchProductError('The page did not contain readable product data.');
  return data;
}
