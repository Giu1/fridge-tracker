export type NutriScore = 'a' | 'b' | 'c' | 'd' | 'e';
/** Id of a place (row in `locations`). The three defaults are 'fridge', 'freezer' and 'emergency'. */
export type Location = string;

/** Where food is kept: Fridge, Freezer, Emergency supplies, plus any you add in the app. */
export interface Place {
  id: Location;
  label: string;
  icon: string | null;
  sort: number;
  created_at: string;
}

export interface RecipeIngredient {
  name: string;
  /** the stored item this ingredient was linked to (may have been used up since) */
  item_id: string | null;
}

/** A Cookidoo (Bimby) recipe you saved, with its ingredients linked to stored items. */
export interface Recipe {
  id: string;
  title: string;
  url: string | null;
  notes: string | null;
  ingredients: RecipeIngredient[];
  /** on this week's menu */
  planned: boolean;
  times_cooked: number;
  last_cooked_on: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

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

/** One food in an uploaded photo, waiting for you to say what it is (no AI: you name it in Review). */
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
