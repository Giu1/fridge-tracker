// Supabase Edge Function: reads a supermarket product page for the WEB app (browsers block cross-site pages).
// No AI: it parses the data the shop publishes (schema.org, meta tags, labelled text) + Open Food Facts by EAN.
//
// Deploy once:  npx supabase functions deploy fetch-product --no-verify-jwt --project-ref <your-ref>
// (--no-verify-jwt because the function checks the caller itself, below, which also works with the new API keys.)
//
// Safety: only signed-in household members (public.is_allowed()) may call it, and it only ever contacts
// the supermarkets' own domains and Open Food Facts, re-checking every redirect.
import { FetchProductError, fetchProduct, isAllowedUrl } from './extract.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

async function isAllowed(req: Request): Promise<boolean> {
  const auth = req.headers.get('authorization');
  const apikey = req.headers.get('apikey') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const base = Deno.env.get('SUPABASE_URL');
  if (!auth || !base) return false;
  const res = await fetch(`${base}/rest/v1/rpc/is_allowed`, {
    method: 'POST',
    headers: { Authorization: auth, apikey, 'Content-Type': 'application/json' },
    body: '{}',
  });
  return res.ok && (await res.json()) === true;
}

/** fetch() that follows at most 5 redirects, and only to allowed hosts. */
async function safeFetch(url: string, init: RequestInit = {}): Promise<Response> {
  let current = url;
  for (let hop = 0; hop < 6; hop++) {
    if (!isAllowedUrl(current)) throw new FetchProductError('The link redirected outside the supermarket site.');
    const res = await fetch(current, { ...init, redirect: 'manual' });
    if (res.status < 300 || res.status >= 400) return res;
    const next = res.headers.get('location');
    if (!next) return res;
    current = new URL(next, current).toString();
  }
  throw new FetchProductError('Too many redirects.');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  try {
    if (!(await isAllowed(req))) return json({ error: 'Not allowed' }, 401);
    const { url } = (await req.json().catch(() => ({}))) as { url?: string };
    if (typeof url !== 'string' || url.length > 2000) return json({ error: 'Send {"url": "https://…"}' }, 400);
    const data = await fetchProduct(url.trim(), { fetcher: safeFetch, timeoutMs: 15000 });
    return json({ data });
  } catch (e) {
    const status = e instanceof FetchProductError ? 422 : 500;
    return json({ error: (e as Error).message, upstream_status: e instanceof FetchProductError ? e.status : undefined }, status);
  }
});
