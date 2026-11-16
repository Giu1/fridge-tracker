/** Places where food is kept. Three defaults; more can be added, renamed or removed in the app. */
import { useMemo } from 'react';
import { DEMO_KEYS } from './demo';
import { deleteRow, insertRow, tableStore, updateRow, useStore } from './store';
import type { Location, Place } from './types';

const t0 = '2026-01-01T00:00:00.000Z';
export const DEFAULT_PLACES: Place[] = [
  { id: 'fridge', label: 'Fridge', icon: '🥛', sort: 0, created_at: t0 },
  { id: 'freezer', label: 'Freezer', icon: '🧊', sort: 1, created_at: t0 },
  { id: 'emergency', label: 'Emergency supplies', icon: '🥫', sort: 2, created_at: t0 },
];

/** Emoji offered when creating a place. */
export const PLACE_ICONS = ['🥛', '🧊', '🥫', '🧺', '🍷', '🍞', '🥔', '🧂', '🍼', '🐾', '📦', '🏠'];

export const placesStore = tableStore<Place>({
  table: 'locations',
  demoKey: DEMO_KEYS.locations,
  sort: (a, b) => a.sort - b.sort || a.created_at.localeCompare(b.created_at),
  demoSeed: () => DEFAULT_PLACES,
});

export function usePlaces() {
  const { rows, loading } = useStore(placesStore);
  // Until the first load, show the defaults so the screen never renders empty.
  const places = rows.length ? rows : DEFAULT_PLACES;
  const byId = useMemo(() => new Map(places.map((p) => [p.id, p])), [places]);
  return { places, byId, loading };
}

/** Label for an item's place, also for places deleted on another device or old ids (e.g. 'pantry'). */
export function placeLabel(byId: Map<string, Place>, id: Location) {
  const p = byId.get(id);
  if (p) return `${p.icon ? `${p.icon} ` : ''}${p.label}`;
  return id.charAt(0).toUpperCase() + id.slice(1);
}

export async function addPlace(label: string, icon: string | null) {
  const clean = label.trim().slice(0, 40);
  if (!clean) throw new Error('Give the place a name.');
  const rows = placesStore.rows().length ? placesStore.rows() : DEFAULT_PLACES;
  if (rows.some((p) => p.label.toLowerCase() === clean.toLowerCase())) throw new Error(`"${clean}" already exists.`);
  const sort = Math.max(-1, ...rows.map((p) => p.sort)) + 1;
  return insertRow(placesStore, { label: clean, icon, sort });
}

export async function renamePlace(place: Place, label: string, icon: string | null) {
  const clean = label.trim().slice(0, 40);
  if (!clean) throw new Error('The name cannot be empty.');
  return updateRow(placesStore, place.id, { label: clean, icon });
}

/** Only empty places can be removed (the database refuses otherwise too). */
export async function removePlace(place: Place, itemsInside: number) {
  if (itemsInside > 0) throw new Error(`Move the ${itemsInside} item${itemsInside === 1 ? '' : 's'} out of ${place.label} first.`);
  if (placesStore.rows().length <= 1) throw new Error('Keep at least one place.');
  await deleteRow(placesStore, place.id);
}

/** Swap a place with its neighbour to reorder the list. */
export async function movePlace(place: Place, dir: -1 | 1) {
  const rows = placesStore.rows();
  const i = rows.findIndex((p) => p.id === place.id);
  const other = rows[i + dir];
  if (!other) return;
  await updateRow(placesStore, place.id, { sort: other.sort });
  await updateRow(placesStore, other.id, { sort: place.sort === other.sort ? place.sort + dir : place.sort });
}
