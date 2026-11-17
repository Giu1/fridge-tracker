/**
 * Reads the list you made from a receipt (with any AI you like, outside the app) and turns it into lines.
 * No AI here: it only parses text. Accepted formats (see README, "Receipt list format"):
 *
 *  1. JSON: an array of objects, or { "items": [...] } (that object may also carry "shop", "date" and "total"):
 *       [{ "name": "Leite meio gordo", "amount": 6, "price": 5.94, "place": "Fridge", "category": "Dairy", "expires": "2026-12-01" }]
 *  2. CSV / TSV with a header line (comma, semicolon, tab or | separated, "quoted" values allowed):
 *       name;amount;place;category;expires;notes
 *       Leite meio gordo;6;Fridge;Dairy;2026-12-01;
 *  3. Plain lines, one product per line: "6 x Leite meio gordo", "Leite meio gordo x6", "Leite meio gordo; 6",
 *     "Leite meio gordo - 6" or just "Leite meio gordo" (amount 1). Bullets and numbering are ignored.
 *
 * Only `name` is required. Column names are matched loosely (English and Portuguese) and unknown ones are ignored.
 */

import { parseMoney } from './money';

export interface ParsedLine {
  name: string;
  amount: number;
  /** place label or id as written ("Fridge", "frigorifico", "freezer"…), resolved later */
  place?: string;
  /** category label as written, resolved later */
  category?: string;
  /** date as written (2026-12-01, 01/12/2026, 20261201…) */
  expires?: string;
  /** days from today, when given instead of a date */
  days?: number;
  notes?: string;
  /** what this line cost in total, in cents */
  price?: number;
}

/** What the whole receipt says about itself (JSON object form only). */
export interface ReceiptMeta {
  shop?: string;
  /** as written; read with parseDateInput / pastDate */
  date?: string;
  totalCents?: number;
}

export interface ParseResult {
  lines: ParsedLine[];
  format: 'json' | 'csv' | 'lines';
  meta?: ReceiptMeta;
  /** lines that could not be read (shown to you, never silently dropped) */
  skipped: string[];
}

type Field = keyof ParsedLine;

const ALIASES: Record<string, Field> = {};
const alias = (field: Field, names: string[]) => names.forEach((n) => (ALIASES[fold(n)] = field));

function fold(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

alias('name', ['name', 'item', 'product', 'produto', 'nome', 'descricao', 'description', 'artigo', 'article', 'title']);
alias('amount', ['amount', 'qty', 'quantity', 'quantidade', 'qtd', 'count', 'units', 'unidades', 'un', 'n']);
alias('place', ['place', 'location', 'local', 'where', 'storage', 'onde', 'lugar']);
alias('category', ['category', 'categoria', 'kind', 'type', 'tipo']);
alias('expires', ['expires', 'expiresOn', 'expires_on', 'expiry', 'expiration', 'validade', 'bestBefore', 'date']);
alias('days', ['days', 'shelfLifeDays', 'shelf_life_days', 'expiresInDays', 'expires_in_days', 'dias']);
alias('price', ['price', 'preco', 'valor', 'cost', 'custo', 'total', 'linetotal', 'line_total', 'subtotal', 'eur', 'euros']);
alias('notes', ['notes', 'note', 'notas', 'nota', 'comment', 'obs', 'brand', 'marca']);

/** Whole number from "6", "6.0", "2,5" (rounded), "6 un"; anything else → 1. */
export function amountOf(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? Math.min(99999, Math.max(1, Math.round(v))) : 1;
  const m = String(v ?? '').match(/\d+(?:[.,]\d+)?/);
  if (!m) return 1;
  const n = parseFloat(m[0].replace(',', '.'));
  return n > 0 ? Math.min(99999, Math.max(1, Math.round(n))) : 1;
}

const clean = (s: unknown) => (s == null ? '' : String(s)).replace(/\s+/g, ' ').trim();

function fromRecord(rec: Record<string, unknown>): ParsedLine | null {
  const out: Partial<Record<Field, unknown>> = {};
  const extraNotes: string[] = [];
  for (const [k, v] of Object.entries(rec)) {
    const f = ALIASES[fold(k)];
    if (!f || v == null || v === '') continue;
    if (f === 'notes') extraNotes.push(clean(v));
    else if (out[f] === undefined) out[f] = v;
  }
  const name = clean(out.name).slice(0, 200);
  if (!name) return null;
  const line: ParsedLine = { name, amount: amountOf(out.amount) };
  if (out.place) line.place = clean(out.place);
  if (out.category) line.category = clean(out.category);
  if (out.expires) line.expires = clean(out.expires);
  if (out.days !== undefined && Number.isFinite(Number(out.days))) line.days = Math.round(Number(out.days));
  const notes = extraNotes.filter(Boolean).join(' · ');
  if (notes) line.notes = notes.slice(0, 2000);
  const price = out.price === undefined ? null : parseMoney(out.price);
  if (price != null) line.price = price;
  return line;
}

const META_KEYS: Record<string, keyof ReceiptMeta> = {};
for (const k of ['shop', 'store', 'loja', 'supermarket', 'supermercado', 'merchant', 'chain']) META_KEYS[fold(k)] = 'shop';
for (const k of ['date', 'data', 'purchaseDate', 'purchased_on', 'purchasedOn', 'boughtOn', 'day']) META_KEYS[fold(k)] = 'date';
for (const k of ['total', 'totalPaid', 'total_paid', 'amountPaid', 'paid', 'pago', 'totalEur', 'totalCents']) META_KEYS[fold(k)] = 'totalCents';

function metaOf(obj: Record<string, unknown>): ReceiptMeta | undefined {
  const meta: ReceiptMeta = {};
  for (const [k, v] of Object.entries(obj)) {
    const f = META_KEYS[fold(k)];
    if (!f || v == null || v === '' || typeof v === 'object') continue;
    if (f === 'totalCents') {
      const c = fold(k) === 'totalcents' ? Math.round(Number(v)) : parseMoney(v);
      if (c != null && Number.isFinite(c) && meta.totalCents === undefined) meta.totalCents = c;
    } else if (!meta[f]) meta[f] = clean(v).slice(0, 80);
  }
  return Object.keys(meta).length ? meta : undefined;
}

/** One CSV row, honouring "quoted, values" and "" escapes. */
function splitRow(row: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < row.length; i++) {
    const c = row[i];
    if (quoted) {
      if (c === '"' && row[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"' && !cur.trim()) {
      quoted = true;
      cur = '';
    } else if (c === sep) {
      out.push(cur.trim());
      cur = '';
    } else cur += c;
  }
  out.push(cur.trim());
  return out;
}

function parseJson(text: string): ParseResult | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  let meta: ReceiptMeta | undefined;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>;
    meta = metaOf(obj);
    data = obj.items ?? obj.products ?? obj.lines ?? obj.produtos ?? Object.values(obj).find(Array.isArray);
  }
  if (!Array.isArray(data)) return null;
  const lines: ParsedLine[] = [];
  const skipped: string[] = [];
  for (const entry of data) {
    const line =
      typeof entry === 'string' ? parsePlainLine(entry) : entry && typeof entry === 'object' ? fromRecord(entry as Record<string, unknown>) : null;
    if (line) lines.push(line);
    else skipped.push(JSON.stringify(entry).slice(0, 120));
  }
  return { lines, format: 'json', skipped, ...(meta ? { meta } : {}) };
}

function parseCsv(rows: string[]): ParseResult | null {
  const head = rows[0];
  const sep = ['\t', ';', '|', ','].find((s) => head.includes(s));
  if (!sep) return null;
  const cols = splitRow(head, sep);
  if (!cols.some((c) => ALIASES[fold(c)] === 'name')) return null; // not a header
  const lines: ParsedLine[] = [];
  const skipped: string[] = [];
  for (const row of rows.slice(1)) {
    const cells = splitRow(row, sep);
    const rec = Object.fromEntries(cols.map((c, i) => [c, cells[i] ?? '']));
    const line = fromRecord(rec);
    if (line) lines.push(line);
    else skipped.push(row);
  }
  return { lines, format: 'csv', skipped };
}

const BULLET = /^\s*(?:[-*•·>]+|\d{1,3}[.)]|\[[ x]?\])\s+/i;
const COUNT = '(\\d{1,5})(?:[.,]0+)?';
const UNIT = '(?:\\s*(?:x|un|unid|unidades|units?|pcs?|uds?)\\.?)';

export function parsePlainLine(raw: string): ParsedLine | null {
  let s = clean(raw).replace(BULLET, '').trim();
  if (!s) return null;
  let amount: number | undefined;
  let m: RegExpMatchArray | null;
  // "6 x Leite", "6x Leite", "6 un Leite"
  if ((m = s.match(new RegExp(`^${COUNT}\\s*(?:x|×|un\\.?|unid\\.?)\\s*(.+)$`, 'i')))) {
    amount = Number(m[1]);
    s = m[2];
  }
  // "Leite x6", "Leite x 6", "Leite (6)", "Leite ; 6", "Leite - 6 un", "Leite, 6", "Leite: 6"
  else if ((m = s.match(new RegExp(`^(.+?)\\s*(?:[x×]\\s*${COUNT}|\\(${COUNT}${UNIT}?\\)|(?:[;:|\\t]|,(?=\\s)|\\s-)\\s*${COUNT}${UNIT}?)\\s*$`, 'i')))) {
    amount = Number(m[2] ?? m[3] ?? m[4]);
    s = m[1];
  }
  // "Leite;6;Fridge" without a header: name; amount; place; category; expires
  else if (/[;\t|]/.test(s)) {
    const sep = [';', '\t', '|'].find((c) => s.includes(c))!;
    const [name, amt, place, category, expires] = splitRow(s, sep);
    if (!name) return null;
    return {
      name: name.slice(0, 200),
      amount: amountOf(amt),
      ...(place ? { place } : {}),
      ...(category ? { category } : {}),
      ...(expires ? { expires } : {}),
    };
  }
  s = s.replace(/[\s;,:|-]+$/, '').trim();
  if (!s || !/[a-zà-ÿ]/i.test(s)) return null;
  return { name: s.slice(0, 200), amount: amount && amount > 0 ? Math.min(amount, 99999) : 1 };
}

/** Read the processed receipt list in any of the supported formats. */
export function parseReceiptList(text: string): ParseResult {
  // Lists pasted from a chat are often wrapped in ```json fences.
  const body = text.replace(/^﻿/, '').replace(/```[a-z]*\s*/gi, '').trim();
  if (!body) return { lines: [], format: 'lines', skipped: [] };
  if (body.startsWith('[') || body.startsWith('{')) {
    const json = parseJson(body);
    if (json) return json;
  }
  const rows = body.split(/\r?\n/).filter((r) => r.trim());
  const csv = rows.length > 1 ? parseCsv(rows) : null;
  if (csv) return csv;
  const lines: ParsedLine[] = [];
  const skipped: string[] = [];
  for (const r of rows) {
    const line = parsePlainLine(r);
    if (line) lines.push(line);
    else skipped.push(r);
  }
  return { lines, format: 'lines', skipped };
}

/** Prompt you can paste into an AI chat together with the receipt, so its answer can be imported as is. */
export const AI_PROMPT = `Read this supermarket receipt and list every food product I bought.
Answer with JSON only, no other text, like this:
{"shop": "Pingo Doce", "date": "2026-11-17", "total": 42.37,
 "items": [{"name": "Leite meio gordo Mimosa", "amount": 6, "price": 5.94, "place": "Fridge", "category": "Dairy", "expires_in_days": 7}]}
- shop, date (YYYY-MM-DD) and total (the amount paid, in euros) come from the receipt itself
- name: a clear product name in Portuguese (expand receipt abbreviations, e.g. "LT MG MIM 1L" -> "Leite meio gordo Mimosa")
- amount: how many units, as a whole number (a product weighed by kg counts as 1)
- price: what that line cost in total, in euros (optional)
- place: Fridge, Freezer or Emergency supplies
- category, expires_in_days: optional, leave them out if unsure
Leave out bags, deposits, discounts and non-food items.`;
