/** Icons for categories (Material Community Icons names), shown instead of a plain colour dot. */
import type { Category } from './types';

/** The icons offered in the picker, roughly grouped: animal, plant, baked, sweet, drinks, other. */
export const CATEGORY_ICONS = [
  'cheese', 'egg', 'food-drumstick', 'food-steak', 'food-turkey', 'cow', 'pig', 'sausage', 'fish',
  'carrot', 'leaf', 'mushroom', 'corn', 'chili-hot', 'food-apple', 'fruit-cherries', 'fruit-citrus', 'fruit-grapes', 'fruit-watermelon',
  'baguette', 'bread-slice', 'food-croissant', 'barley', 'noodles', 'rice', 'pizza',
  'cupcake', 'cookie', 'candy', 'ice-cream', 'popcorn', 'peanut',
  'cup', 'bottle-soda-classic', 'cup-water', 'coffee', 'tea', 'beer', 'bottle-wine', 'glass-cocktail', 'water', 'baby-bottle',
  'food-takeout-box', 'pot-steam', 'bowl-mix', 'snowflake', 'shaker-outline', 'silverware-fork-knife', 'tag',
] as const;

export type CategoryIconName = (typeof CATEGORY_ICONS)[number];
export const DEFAULT_ICON: CategoryIconName = 'tag';
const known = new Set<string>(CATEGORY_ICONS);

/** Words (English and Portuguese) that suggest an icon from a category's name. First match wins. */
const HINTS: [RegExp, CategoryIconName][] = [
  [/dairy|cheese|queijo|latic|lactic|yog|iogurt/, 'cheese'],
  [/milk|leite/, 'cup'],
  [/egg|ovo/, 'egg'],
  [/chicken|poultry|frango|aves|turkey|peru/, 'food-turkey'],
  [/sausage|salsich|enchid|chouri|ham|fiambre|deli|charcut/, 'sausage'],
  [/meat|carne|beef|pork|porco|vaca|steak|bife/, 'food-drumstick'],
  [/fish|peixe|shrimp|prawn|seafood|marisco|camar|bacalhau|tuna|atum|salmon|salm/, 'fish'],
  [/veg|legum|horta|salad|greens|verdura/, 'carrot'],
  [/herb|erva/, 'leaf'],
  [/fruit|fruta/, 'food-apple'],
  [/bread|p[aã]o|bak|padaria|pastel|grain|cereal|gr[aã]o/, 'baguette'],
  [/pasta|massa|noodle/, 'noodles'],
  [/rice|arroz/, 'rice'],
  [/pizza/, 'pizza'],
  [/sweet|doce|dessert|sobremesa|cake|bolo/, 'cupcake'],
  [/snack|cookie|biscoit|bolach/, 'cookie'],
  [/candy|choc|gulosei/, 'candy'],
  [/ice ?cream|gelado/, 'ice-cream'],
  [/nut|noz|frutos secos/, 'peanut'],
  [/coffee|caf[eé]/, 'coffee'],
  [/tea\b|ch[aá]\b/, 'tea'],
  [/beer|cerveja/, 'beer'],
  [/wine|vinho|alcohol|[aá]lcool/, 'bottle-wine'],
  [/water|[aá]gua/, 'cup-water'],
  [/drink|bebida|juice|sumo|soda/, 'bottle-soda-classic'],
  [/baby|beb[eé]/, 'baby-bottle'],
  [/left ?over|sobra|meal|refei|takeaway|take-away/, 'food-takeout-box'],
  [/soup|sopa|stew|cozid/, 'pot-steam'],
  [/frozen|congel|freez/, 'snowflake'],
  [/spice|tempero|condiment|sauce|molho/, 'shaker-outline'],
];

/** An icon that fits a category name, or the plain tag. */
export function guessIcon(label: string): CategoryIconName {
  const l = label.toLowerCase();
  return HINTS.find(([re]) => re.test(l))?.[1] ?? DEFAULT_ICON;
}

/** The icon to draw: the one picked, else a guess from the name (also covers servers without the icon column yet). */
export function iconFor(c: Pick<Category, 'icon' | 'label'>): CategoryIconName {
  return c.icon && known.has(c.icon) ? (c.icon as CategoryIconName) : guessIcon(c.label);
}
