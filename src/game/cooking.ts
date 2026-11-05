import { getBaseItemId, getItemRarity, type InventoryStack, type ItemRarity } from './inventory';

export type CookingSlot = 'quick' | 'pan';
export type CookingAttribute = 'forca' | 'destreza' | 'inteligencia' | 'velocidadeAtaque' | 'velocidadeMovimento';
export type CookingEffects = Partial<Record<CookingAttribute, number>> & { healingPerSecond?: number };
export type CookingMeal = {
  id: string;
  slot: CookingSlot;
  name: string;
  icon: string;
  rarity: ItemRarity | 'normal';
  effects: CookingEffects;
  ingredients: Array<{ itemId: string; quantity: number }>;
};
export type ActiveCookingMeal = CookingMeal & { remainingSeconds: number };

const STORAGE_KEY = 'fibula-prepared-meals';
const RARITY_INDEX: Record<ItemRarity | 'normal', number> = { normal: 0, common: 1, uncommon: 2, rare: 3, legendary: 4 };
const RARITY_STATS = {
  normal: { damage: 6, utility: 3 },
  common: { damage: 12, utility: 6 },
  uncommon: { damage: 18, utility: 9 },
  rare: { damage: 24, utility: 12 },
  legendary: { damage: 30, utility: 15 },
} as const;
const RARITY_HEAL = { normal: 0.5, common: 1, uncommon: 1.8, rare: 2.2, legendary: 5 } as const;
const FISH_ITEMS = ['tilapia', 'tambaqui', 'pintado_surubim', 'lambari', 'tucunare'];
const MEAT_ITEMS = ['wolf_meat'];
const QUICK_MEAL_SECONDS = 30 * 60;
const PAN_FACTOR_PER_UNIT = 0.3 / 10;
const HERB_BONUS_PER_UNIT = 0.03;
const MAX_HERB_BONUS = 0.3;

export function getCookingRarity(itemId: string): ItemRarity | 'normal' {
  return getItemRarity(itemId) ?? 'normal';
}

export function isCookingIngredient(itemId: string): boolean {
  const base = getBaseItemId(itemId);
  return base === 'tomato' || base === 'cabbage' || base === 'herbs'
    || MEAT_ITEMS.includes(base) || base === 'chicken_meat' || FISH_ITEMS.includes(base);
}

export function readPreparedMeals(): CookingMeal[] {
  if (typeof window === 'undefined') return [];
  try {
    const saved: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]');
    if (!Array.isArray(saved)) return [];
    return saved.filter((meal): meal is CookingMeal =>
      !!meal && typeof meal === 'object' && (meal.slot === 'quick' || meal.slot === 'pan')
      && typeof meal.id === 'string' && typeof meal.name === 'string'
      && Array.isArray(meal.ingredients) && !!meal.effects && typeof meal.effects === 'object',
    ).slice(0, 2);
  } catch { return []; }
}

export function writePreparedMeals(meals: CookingMeal[]): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(meals.slice(0, 2))); } catch { /* Armazenamento local indisponível. */ }
}

export function getCookingIngredientStacks(inventory: InventoryStack[]): InventoryStack[] {
  return inventory.filter(stack => isCookingIngredient(stack.itemId) && stack.quantity > 0);
}

export function getQuickRecipe(itemId: string, quantity: number, herbs = 0): CookingMeal | null {
  if (!Number.isSafeInteger(quantity) || quantity <= 0 || !isCookingIngredient(itemId)) return null;
  const base = getBaseItemId(itemId);
  const rarity = getCookingRarity(itemId);
  const tier = RARITY_STATS[rarity];
  const herbMultiplier = 1 + Math.min(MAX_HERB_BONUS, herbs * HERB_BONUS_PER_UNIT);
  const scale = quantity / 10;
  const effects: CookingEffects = {};
  let name = '';
  let icon = '';
  if (MEAT_ITEMS.includes(base)) {
    name = 'Carne grelhada'; icon = '🥩';
    effects.forca = tier.damage * scale;
    effects.destreza = tier.damage * scale;
  } else if (base === 'chicken_meat') {
    name = 'Frango grelhado'; icon = '🍗';
    effects.inteligencia = tier.damage * scale;
  } else if (FISH_ITEMS.includes(base)) {
    name = 'Peixe grelhado'; icon = '🐟';
    effects.velocidadeAtaque = tier.utility * scale;
  } else if (base === 'cabbage') {
    name = 'Sopa de repolho'; icon = '🥬';
    effects.velocidadeMovimento = tier.utility * scale;
  } else if (base === 'tomato') {
    name = 'Sopa de tomate'; icon = '🍅';
    effects.healingPerSecond = RARITY_HEAL[rarity] * scale;
  } else return null;
  if (herbs > 0) {
    for (const key of Object.keys(effects) as Array<keyof CookingEffects>) {
      if (typeof effects[key] === 'number') effects[key] = effects[key]! * herbMultiplier;
    }
  }
  return {
    id: `quick-${Date.now()}-${base}`, slot: 'quick', name, icon, rarity,
    effects, ingredients: [{ itemId, quantity }, ...(herbs > 0 ? [{ itemId: `herbs${itemId.includes(':') ? `:${rarity}` : ''}`, quantity: herbs }] : [])],
  };
}

export function getPanMeal(ingredients: Array<{ itemId: string; quantity: number }>): CookingMeal | null {
  const valid = ingredients.filter(item => isCookingIngredient(item.itemId) && Number.isSafeInteger(item.quantity) && item.quantity > 0);
  if (valid.length < 1 || valid.length > 4 || valid.reduce((sum, item) => sum + item.quantity, 0) > 40) return null;
  const rarity = getCookingRarity(valid[0].itemId);
  if (valid.some(item => getCookingRarity(item.itemId) !== rarity)) return null;
  const effects: CookingEffects = {};
  let herbs = 0;
  for (const item of valid) {
    const base = getBaseItemId(item.itemId);
    if (base === 'herbs') { herbs += item.quantity; continue; }
    const meal = getQuickRecipe(item.itemId, item.quantity);
    if (!meal) continue;
    for (const [key, value] of Object.entries(meal.effects) as Array<[keyof CookingEffects, number]>) {
      effects[key] = (effects[key] ?? 0) + value * PAN_FACTOR_PER_UNIT * 10;
    }
  }
  const herbMultiplier = 1 + Math.min(MAX_HERB_BONUS, herbs * HERB_BONUS_PER_UNIT);
  for (const key of Object.keys(effects) as Array<keyof CookingEffects>) {
    effects[key] = Math.min(effects[key]!, (effects[key]! * herbMultiplier));
  }
  return {
    id: `pan-${Date.now()}`, slot: 'pan', name: 'Refeição da panela', icon: '🍲', rarity,
    effects, ingredients: valid.map(item => ({ ...item })),
  };
}

export function consumeCookingIngredients(inventory: InventoryStack[], meal: CookingMeal): InventoryStack[] | null {
  const next = inventory.map(stack => ({ ...stack }));
  for (const ingredient of meal.ingredients) {
    let remaining = ingredient.quantity;
    for (let i = next.length - 1; i >= 0 && remaining > 0; i--) {
      if (next[i].itemId !== ingredient.itemId) continue;
      const used = Math.min(remaining, next[i].quantity);
      next[i].quantity -= used;
      remaining -= used;
      if (next[i].quantity <= 0) next.splice(i, 1);
    }
    if (remaining > 0) return null;
  }
  return next;
}

export const COOKING_DURATION_SECONDS = QUICK_MEAL_SECONDS;
export const COOKING_RARITY_TIER = RARITY_INDEX;
