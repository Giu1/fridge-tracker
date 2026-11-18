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

/** A coloured tag for the kind of food (Dairy, Meat, ...), separate from the place it is kept. */
export interface Category {
  id: string;
  label: string;
  /** #RRGGBB */
  color: string;
  sort: number;
  created_at: string;
}

export interface Item {
  id: string;
  name: string;
  /** how many (whole number) */
  amount: number;
  location: Location;
  /** null = no category (also after its category was removed) */
  category_id?: string | null;
  expires_on: string | null;
  photo_path: string | null;
  barcode: string | null;
  brand: string | null;
  product_name: string | null;
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
  /** pack size from Open Food Facts ("500 g"), not how many you have */
  quantity: string | null;
  nova_group: number | null;
  kcal_100g: number | null;
  image_url: string | null;
  categories?: string | null;
}

/** One food in an uploaded photo, waiting for you to say what it is (no AI: you name it in the photo inbox). */
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

/** A receipt you sent (photo or PDF), or a list imported on its own (no file). */
export interface Receipt {
  id: string;
  title: string | null;
  file_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  /** sent = waiting for its list, drafts = list imported and being checked, done = items added */
  status: 'sent' | 'drafts' | 'done';
  item_count: number;
  /** day of the purchase (YYYY-MM-DD); when empty the day it was sent counts */
  purchased_on?: string | null;
  shop?: string | null;
  /** amount paid, in cents */
  total_cents?: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** One line of an imported receipt list, checked and corrected on the bulk edit page before it becomes an item. */
export interface ReceiptLine {
  id: string;
  receipt_id: string;
  sort: number;
  name: string;
  amount: number;
  location: Location | null;
  category_id: string | null;
  expires_on: string | null;
  notes: string | null;
  photo_path: string | null;
  created_at: string;
  updated_at: string;
}

/** A remembered photo that fuzzy-matches a name. */
export interface PhotoMatch {
  name: string;
  photo_path: string;
  score: number;
}
