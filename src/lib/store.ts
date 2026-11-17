/**
 * Local-first table store: the reason the app opens instantly.
 *
 *  1. On start, rows come from this device's cache (SQLite on Android, browser storage on web) and show at once.
 *  2. One server fetch refreshes them in the background.
 *  3. One realtime channel per table patches rows in place (no refetch per change), shared by every screen.
 *  4. When the app comes back to the foreground or the connection returns, it refreshes once more.
 *
 * Every screen reads the same in-memory copy, so moving between screens never waits for the network.
 * In demo mode the "server" is this device's own storage.
 */
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { newId, readDemo, subscribeDemo, writeDemo } from './demo';
import { kvGet, kvSet } from './localdb';
import { isDemo } from './mode';
import { supabase } from './supabase';

export interface Row {
  id: string;
}

export interface StoreState<T> {
  rows: T[];
  loading: boolean;
  offline: boolean;
}

export interface TableStore<T extends Row> {
  table: string;
  demoKey: string;
  get(): StoreState<T>;
  rows(): T[];
  subscribe(fn: () => void): () => void;
  refresh(): Promise<void>;
  /** Apply a row we just wrote, before realtime echoes it back. */
  upsertLocal(row: T): void;
  removeLocal(id: string): void;
  /** Forget everything (sign-out, demo switch) and wipe this device's cached copy. */
  reset(): void;
}

const all: TableStore<Row>[] = [];
const INITIAL = { rows: [], loading: true, offline: false };

export function tableStore<T extends Row>(opts: {
  table: string;
  demoKey: string;
  sort: (a: T, b: T) => number;
  /** demo mode only: rows to start with when this browser has none yet */
  demoSeed?: () => T[];
}): TableStore<T> {
  let state: StoreState<T> = INITIAL as StoreState<T>;
  const listeners = new Set<() => void>();
  let started = false;
  let generation = 0;
  let channel: RealtimeChannel | null = null;
  let offDemo: (() => void) | null = null;
  let persistTimer: ReturnType<typeof setTimeout> | null = null;
  let lostConnection = false;

  const cacheKey = () => `cache.${isDemo() ? 'demo.' : ''}${opts.table}`;
  const emit = () => listeners.forEach((fn) => fn());
  const set = (patch: Partial<StoreState<T>>) => {
    state = { ...state, ...patch };
    emit();
  };
  const persist = () => {
    if (persistTimer) clearTimeout(persistTimer);
    const key = cacheKey();
    persistTimer = setTimeout(() => {
      kvSet(key, JSON.stringify(state.rows)).catch(() => {});
    }, 300);
  };
  const setRows = (rows: T[]) => {
    set({ rows: [...rows].sort(opts.sort), loading: false });
    persist();
  };

  const refresh = async () => {
    const gen = generation;
    try {
      let rows: T[];
      if (isDemo()) {
        rows = await readDemo<T[]>(opts.demoKey, opts.demoSeed ? opts.demoSeed() : []);
      } else {
        const { data, error } = await supabase.from(opts.table).select('*');
        if (error) throw error;
        rows = data as T[];
      }
      if (gen !== generation) return;
      setRows(rows);
      if (state.offline) set({ offline: false });
    } catch {
      if (gen !== generation) return;
      set({ offline: true, loading: false });
    }
  };

  const start = () => {
    if (started) return;
    started = true;
    const gen = generation;
    kvGet(cacheKey())
      .then((raw) => {
        if (gen !== generation || !raw || !state.loading) return;
        const cached = JSON.parse(raw) as T[];
        if (cached.length) set({ rows: cached, loading: false });
      })
      .catch(() => {})
      .finally(() => {
        if (gen === generation) refresh();
      });

    if (isDemo()) {
      offDemo = subscribeDemo(refresh);
      return;
    }
    channel = supabase
      .channel(`rt-${opts.table}-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: opts.table }, (payload) => {
        if (payload.eventType === 'DELETE') store.removeLocal((payload.old as Row).id);
        else store.upsertLocal(payload.new as T);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          if (lostConnection) refresh(); // catch up on what happened while disconnected
          lostConnection = false;
        } else {
          lostConnection = true;
        }
      });
  };

  const store: TableStore<T> = {
    table: opts.table,
    demoKey: opts.demoKey,
    get: () => state,
    rows: () => state.rows,
    subscribe(fn) {
      listeners.add(fn);
      start();
      return () => {
        listeners.delete(fn);
      };
    },
    refresh,
    upsertLocal(row) {
      if (!row?.id) return;
      const i = state.rows.findIndex((r) => r.id === row.id);
      const rows = [...state.rows];
      if (i >= 0) rows[i] = { ...rows[i], ...row };
      else rows.push(row);
      setRows(rows);
    },
    removeLocal(id) {
      if (!state.rows.some((r) => r.id === id)) return;
      setRows(state.rows.filter((r) => r.id !== id));
    },
    reset() {
      const key = cacheKey();
      generation += 1;
      if (channel) supabase.removeChannel(channel);
      channel = null;
      offDemo?.();
      offDemo = null;
      if (persistTimer) clearTimeout(persistTimer);
      kvSet(key, null).catch(() => {});
      started = false;
      state = INITIAL as StoreState<T>;
      emit();
      if (listeners.size) start();
    },
  };
  all.push(store as unknown as TableStore<Row>);
  return store;
}

/** Wipe every table's memory and cached copy: used on sign-out and when switching demo mode. */
export function resetStores() {
  for (const s of all) s.reset();
}

export function useStore<T extends Row>(store: TableStore<T>) {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

// ---- writes: same calls in real and demo mode; the screen updates at once --------------------------------

const demoRows = <T extends Row>(store: TableStore<T>) => readDemo<T[]>(store.demoKey, store.rows());

export async function insertRow<T extends Row>(store: TableStore<T>, values: Partial<T>): Promise<T> {
  if (isDemo()) {
    const now = new Date().toISOString();
    const row = { id: newId(), created_at: now, updated_at: now, ...values } as unknown as T;
    await writeDemo(store.demoKey, [...(await demoRows(store)), row]);
    store.upsertLocal(row);
    return row;
  }
  const { data, error } = await supabase.from(store.table).insert(values as never).select().single();
  if (error) throw error;
  store.upsertLocal(data as T);
  return data as T;
}

/** Insert many rows in one request. */
export async function insertRows<T extends Row>(store: TableStore<T>, values: Partial<T>[]): Promise<T[]> {
  if (!values.length) return [];
  if (isDemo()) {
    const now = new Date().toISOString();
    const rows = values.map((v) => ({ id: newId(), created_at: now, updated_at: now, ...v }) as unknown as T);
    await writeDemo(store.demoKey, [...(await demoRows(store)), ...rows]);
    rows.forEach((r) => store.upsertLocal(r));
    return rows;
  }
  const { data, error } = await supabase.from(store.table).insert(values as never).select();
  if (error) throw error;
  (data as T[]).forEach((r) => store.upsertLocal(r));
  return data as T[];
}

export async function updateRow<T extends Row>(store: TableStore<T>, id: string, patch: Partial<T>): Promise<T> {
  if (isDemo()) {
    const rows = await demoRows(store);
    const old = rows.find((r) => r.id === id);
    if (!old) throw new Error('Not found');
    const row = { ...old, ...patch, updated_at: new Date().toISOString() } as T;
    await writeDemo(store.demoKey, rows.map((r) => (r.id === id ? row : r)));
    store.upsertLocal(row);
    return row;
  }
  const { data, error } = await supabase.from(store.table).update(patch as never).eq('id', id).select().single();
  if (error) throw error;
  store.upsertLocal(data as T);
  return data as T;
}

export async function deleteRow<T extends Row>(store: TableStore<T>, id: string) {
  if (isDemo()) {
    await writeDemo(store.demoKey, (await demoRows(store)).filter((r) => r.id !== id));
  } else {
    const { error } = await supabase.from(store.table).delete().eq('id', id);
    if (error) throw error;
  }
  store.removeLocal(id);
}

// Realtime does not deliver while the phone sleeps: refresh once when the app is back (at most every 20 s).
let lastWake = 0;
AppState.addEventListener('change', (s) => {
  if (s !== 'active' || Date.now() - lastWake < 20_000) return;
  lastWake = Date.now();
  for (const store of all) store.refresh();
});
