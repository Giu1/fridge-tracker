/**
 * Background worker: recognises food in uploaded photos with Claude Haiku 5.5 (vision),
 * then links each guess to real products sold in Portuguese supermarkets (Open Food Facts).
 *
 * Called by the app right after a batch upload (returns immediately, keeps working in the
 * background) and re-invokes itself until the queue is empty. Cost: roughly $0.0003 per photo.
 *
 * Secrets (supabase secrets set ...): ANTHROPIC_API_KEY.
 * SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided automatically.
 */
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { encodeBase64 } from '@std/encoding/base64';
import Fuse from 'fuse.js';
import { z } from 'zod';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MODEL = 'claude-haiku-5-5'; // cheapest vision-capable Claude model: $0.10 / $0.50 per million tokens
const BUCKET = 'fridge-photos';
const TIME_BUDGET_MS = 110_000; // stay under the free-tier 150 s limit, then hand over to a fresh invocation
const UA = 'FridgeTrackerPersonal/1.0 (personal use app)';

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY

// ---------------------------------------------------------------------------------------
// What we ask the model for
// ---------------------------------------------------------------------------------------
const Detection = z.object({
  name_pt: z.string().describe('Short generic product name in European Portuguese, as on a Portuguese supermarket shelf, e.g. "Iogurte grego natural"'),
  brand: z.string().nullable().describe('Brand if readable on the package, else null'),
  quantity: z.string().nullable().describe('Net quantity printed or clearly estimable, e.g. "1 L", "4 x 125 g", else null'),
  search_query: z.string().describe('Best Portuguese search query to find this exact product in a supermarket catalogue: brand + product + variant'),
  generic_query: z.string().describe('Shorter generic Portuguese query without brand, e.g. "iogurte grego"'),
  barcode: z.string().nullable().describe('EAN digits only if clearly readable in the photo, else null'),
  location: z.enum(['fridge', 'freezer', 'pantry']).describe('Where this is normally stored after opening/buying'),
  shelf_life_days: z.number().int().nullable().describe('Typical days it keeps in that location from today, null if unsure'),
  confidence: z.number().describe('0 to 1: how sure you are about the product identity'),
});
const Recognition = z.object({
  items: z.array(Detection).describe('Distinct food products visible, most prominent first, at most 4. Empty if no food.'),
});

const SYSTEM = `You identify groceries in photos taken in a home in Portugal, for a fridge inventory app.
Products are mostly bought at Portuguese supermarkets (Continente, Pingo Doce, Lidl, Auchan, Intermarché, Mercadona, Minipreço, Aldi), so use Portuguese (pt-PT) product names and the names those chains use.
Read brand, variant and quantity from the packaging when visible. For loose produce or leftovers, give a plain name (e.g. "Alface", "Sopa de legumes") with brand null.
List only actual food or drink. Ignore shelves, hands, containers without a recognisable content. At most 4 items.`;

type Guess = z.infer<typeof Detection>;

async function recognise(photo: Uint8Array, mediaType: 'image/jpeg' | 'image/png' | 'image/webp') {
  const response = await anthropic.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    system: SYSTEM,
    output_config: { effort: 'low', format: zodOutputFormat(Recognition) },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: encodeBase64(photo) } },
          { type: 'text', text: 'What food products are in this photo?' },
        ],
      },
    ],
  });
  if (response.stop_reason === 'refusal') throw new Error('The model declined this photo');
  if (response.stop_reason === 'max_tokens') throw new Error('Recognition response was cut off');
  const parsed = response.parsed_output;
  if (!parsed) throw new Error('Could not read the recognition result');
  const u = response.usage;
  const cost = (u.input_tokens + (u.cache_read_input_tokens ?? 0)) * 0.1e-6 + u.output_tokens * 0.5e-6;
  return { items: parsed.items.slice(0, 4), cost };
}

// ---------------------------------------------------------------------------------------
// Supermarket products (Open Food Facts, Portugal)
// ---------------------------------------------------------------------------------------
interface Product {
  code: string;
  name: string;
  brand: string | null;
  quantity: string | null;
  nutriscore: string | null;
  nova_group: number | null;
  kcal_100g: number | null;
  image_url: string | null;
  stores: string[];
}

const STORE_ALIASES: Record<string, string[]> = {
  continente: ['continente', 'modelo-continente'],
  'pingo-doce': ['pingo-doce', 'pingodoce'],
  lidl: ['lidl'],
  auchan: ['auchan', 'jumbo', 'pao-de-acucar'],
  intermarche: ['intermarche', 'os-mosqueteiros'],
  mercadona: ['mercadona', 'hacendado'],
  minipreco: ['minipreco', 'dia'],
  aldi: ['aldi'],
  'el-corte-ingles': ['el-corte-ingles'],
};
const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, '-');

function stores(raw: (string | undefined)[]): string[] {
  const out = new Set<string>();
  for (const r of raw) for (const part of (r ?? '').split(',')) {
    const t = slug(part.replace(/^[a-z]{2}:/, ''));
    for (const [key, aliases] of Object.entries(STORE_ALIASES)) if (t && aliases.some((a) => t.startsWith(a))) out.add(key);
  }
  return [...out];
}

// deno-lint-ignore no-explicit-any
function fromOff(p: any): Product | null {
  const name = String(p.product_name_pt || p.product_name || p.generic_name_pt || '').trim();
  if (!p.code || !name) return null;
  const grade = String(p.nutriscore_grade || '').toLowerCase();
  const kcal = Number(p.nutriments?.['energy-kcal_100g']);
  return {
    code: String(p.code),
    name,
    brand: p.brands ? String(p.brands).split(',')[0].trim() : null,
    quantity: p.quantity ? String(p.quantity).trim() : null,
    nutriscore: 'abcde'.includes(grade) && grade.length === 1 ? grade : null,
    nova_group: typeof p.nova_group === 'number' ? p.nova_group : null,
    kcal_100g: Number.isFinite(kcal) ? Math.round(kcal) : null,
    image_url: p.image_front_small_url || p.image_small_url || null,
    stores: stores([p.stores, ...(p.stores_tags ?? [])]),
  };
}

const FIELDS = 'code,product_name,product_name_pt,generic_name_pt,brands,quantity,nutriscore_grade,nova_group,nutriments,image_front_small_url,image_small_url,stores,stores_tags';
let lastSearch = 0;

async function searchProducts(query: string): Promise<Product[]> {
  const key = slug(query);
  if (!key) return [];
  const { data: cached } = await admin.from('product_cache').select('results, fetched_at').eq('query', key).maybeSingle();
  if (cached && Date.now() - new Date(cached.fetched_at).getTime() < 30 * 86400_000) return cached.results as Product[];

  // Open Food Facts allows ~10 searches/minute: space them out.
  const wait = lastSearch + 6500 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastSearch = Date.now();
  const url = `https://pt.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}` +
    `&search_simple=1&action=process&json=1&page_size=30&sort_by=unique_scans_n&lc=pt&fields=${FIELDS}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Open Food Facts search failed (${res.status})`);
  const json = await res.json();
  const products = ((json.products ?? []) as unknown[]).map(fromOff).filter((p): p is Product => !!p);
  await admin.from('product_cache').upsert({ query: key, results: products, fetched_at: new Date().toISOString() });
  return products;
}

async function byBarcode(code: string): Promise<Product | null> {
  const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${FIELDS}`, {
    headers: { 'User-Agent': UA },
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.status === 1 ? fromOff({ ...json.product, code }) : null;
}

function rank(guess: Guess, products: Product[]): (Product & { match: number })[] {
  const unique = [...new Map(products.map((p) => [p.code, p])).values()];
  const fuse = new Fuse(unique, {
    keys: [{ name: 'name', weight: 0.7 }, { name: 'brand', weight: 0.3 }],
    includeScore: true, ignoreLocation: true, ignoreDiacritics: true, threshold: 0.6,
  });
  const q = [guess.name_pt, guess.brand].filter(Boolean).join(' ');
  return fuse.search(q).map((r) => {
    let s = r.score ?? 1;
    if (guess.brand && r.item.brand && slug(r.item.brand) === slug(guess.brand)) s -= 0.2;
    if (r.item.stores.length) s -= 0.05;
    if (r.item.nutriscore) s -= 0.03;
    return { ...r.item, match: Math.max(0, Math.min(1, 1 - s)) };
  }).sort((a, b) => b.match - a.match).slice(0, 5);
}

async function candidatesFor(guess: Guess) {
  const found: Product[] = [];
  if (guess.barcode && /^\d{8,14}$/.test(guess.barcode)) {
    const p = await byBarcode(guess.barcode).catch(() => null);
    if (p) found.push(p);
  }
  found.push(...await searchProducts(guess.search_query).catch(() => []));
  if (found.length < 3 && slug(guess.generic_query) !== slug(guess.search_query)) {
    found.push(...await searchProducts(guess.generic_query).catch(() => []));
  }
  const ranked = rank(guess, found);
  // A barcode hit is exact: put it first.
  if (found[0] && guess.barcode && found[0].code === guess.barcode) {
    return [{ ...found[0], match: 1 }, ...ranked.filter((p) => p.code !== guess.barcode)].slice(0, 5);
  }
  return ranked;
}

// ---------------------------------------------------------------------------------------
// Queue worker
// ---------------------------------------------------------------------------------------
async function processOne(db: SupabaseClient, job: { id: string; photo_path: string }) {
  try {
    const { data: blob, error } = await db.storage.from(BUCKET).download(job.photo_path);
    if (error || !blob) throw new Error(`photo missing: ${error?.message ?? ''}`);
    const ext = job.photo_path.split('.').pop()?.toLowerCase();
    const mediaType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
    const { items, cost } = await recognise(new Uint8Array(await blob.arrayBuffer()), mediaType);
    const detections = [];
    for (const guess of items) detections.push({ ...guess, candidates: await candidatesFor(guess) });
    await db.from('photo_jobs').update({ status: 'ready', detections, error: null, cost_usd: cost }).eq('id', job.id);
  } catch (e) {
    let message = e instanceof Error ? e.message : String(e);
    if (e instanceof Anthropic.AuthenticationError) message = 'ANTHROPIC_API_KEY is missing or invalid';
    else if (e instanceof Anthropic.RateLimitError) message = 'AI rate limited, will retry';
    const retry = e instanceof Anthropic.RateLimitError || e instanceof Anthropic.InternalServerError || e instanceof Anthropic.APIConnectionError;
    await db.from('photo_jobs').update(retry ? { status: 'pending', error: message } : { status: 'failed', error: message }).eq('id', job.id);
    if (retry) await new Promise((r) => setTimeout(r, 5000));
  }
}

async function drainQueue() {
  const started = Date.now();
  while (Date.now() - started < TIME_BUDGET_MS) {
    const { data: job, error } = await admin.rpc('claim_photo_job');
    if (error) throw error;
    if (!job?.id) return; // queue empty
    await processOne(admin, job);
  }
  // Out of time but maybe more work: continue in a fresh invocation.
  const { count } = await admin.from('photo_jobs').select('id', { count: 'exact', head: true }).eq('status', 'pending');
  if (count) {
    await fetch(`${SUPABASE_URL}/functions/v1/process-photos`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: '{}',
    }).catch(() => {});
  }
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405, headers: cors });

  // Only the two allowed accounts (or this function re-invoking itself) may start the worker.
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (token !== SERVICE_KEY) {
    const asUser = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });
    const { data: allowed, error } = await asUser.rpc('is_allowed');
    if (error || allowed !== true) return new Response('forbidden', { status: 403, headers: cors });
  }

  const work = drainQueue().catch((e) => console.error('worker failed', e));
  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(work); // keep going after we reply
  else await work;
  return new Response(JSON.stringify({ started: true }), { status: 202, headers: { ...cors, 'Content-Type': 'application/json' } });
});
