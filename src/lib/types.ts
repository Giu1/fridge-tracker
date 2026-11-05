export type NutriScore = 'a' | 'b' | 'c' | 'd' | 'e';
export type Location = 'fridge' | 'freezer' | 'pantry';

export const LOCATIONS: { key: Location; label: string }[] = [
  { key: 'fridge', label: 'Fridge' },
  { key: 'freezer', label: 'Freezer' },
  { key: 'pantry', label: 'Pantry' },
];

export interface Item {
  id: string;
  name: string;
  quantity: string | null;
  location: Location;
  expires_on: string | null;
  photo_path: string | null;
  barcode: string | null;
  brand: string | null;
  product_name: string | null;
  stores: string | null;
  nutriscore: NutriScore | null;
  nova_group: number | null;
  kcal_100g: number | null;
  off_image_url: string | null;
  notes: string | null;
  added_by: string | null;
  created_at: string;
  updated_at: string;
}

export type ItemDraft = Omit<Item, 'id' | 'added_by' | 'created_at' | 'updated_at'>;

/** A product reference from Open Food Facts (Portugal). */
export interface Product {
  code: string;
  name: string;
  brand: string | null;
  quantity: string | null;
  nutriscore: NutriScore | null;
  nova_group: number | null;
  kcal_100g: number | null;
  image_url: string | null;
  stores: string[];
  categories?: string | null;
}

/** One food the AI found in a photo, with the supermarket products it might be. */
export interface Detection {
  name_pt: string;
  brand: string | null;
  quantity: string | null;
  location: Location;
  shelf_life_days: number | null;
  confidence: number;
  candidates: (Product & { match: number })[];
}

export type Decision = { status: 'accepted'; item_id: string } | { status: 'rejected' } | null;

export interface PhotoJob {
  id: string;
  photo_path: string;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  detections: Detection[] | null;
  decisions: Decision[];
  error: string | null;
  cost_usd: number | null;
  created_at: string;
}
