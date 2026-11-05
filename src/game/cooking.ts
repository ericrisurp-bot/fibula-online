import { getBaseItemId, getItemRarity, type InventoryStack, type ItemRarity } from './inventory';

export type CookingSlot = 'quick' | 'pan';
export type CookingAttribute = 'forca' | 'destreza' | 'inteligencia' | 'velocidadeAtaque' | 'velocidadeMovimento';
export type CookingEffects = Partial<Record<CookingAttribute, number>> & { healingPerSecond?: number };
export type CookingMeal = {
  id: string; slot: CookingSlot; name: string; icon: string;
  rarity: ItemRarity | 'normal'; effects: CookingEffects;
  ingredients: Array<{ itemId: string; quantity: number }>;
  durationSeconds?: number;
  herbExtended?: boolean;
};
export type ActiveCookingMeal = CookingMeal & { remainingSeconds: number };

const STORAGE_KEY = 'fibula-prepared-meals';
const RARITY_INDEX: Record<ItemRarity | 'normal', number> = { normal: 0, common: 1, uncommon: 2, rare: 3, legendary: 4 };
const RARITY_STATS = {
  normal: { damage: 6, utility: 3 }, common: { damage: 12, utility: 6 },
  uncommon: { damage: 18, utility: 9 }, rare: { damage: 24, utility: 12 },
  legendary: { damage: 30, utility: 15 },
} as const;
const RARITY_HEAL = { normal: 0.5, common: 1, uncommon: 1.8, rare: 2.2, legendary: 5 } as const;
const HERB_MINUTES_PER_UNIT = { normal: 2, common: 4, uncommon: 6, rare: 8, legendary: 10 } as const;
const FISH_ITEMS = ['tilapia', 'tambaqui', 'pintado_surubim', 'lambari', 'tucunare'];
const MEAT_ITEMS = ['wolf_meat'];
const QUICK_MEAL_SECONDS = 30 * 60;

export function getCookingRarity(itemId: string): ItemRarity | 'normal' {
  return getItemRarity(itemId) ?? 'normal';
}
export function isCookingIngredient(itemId: string): boolean {
  const base = getBaseItemId(itemId);
  return base === 'tomato' || base === 'cabbage' || base === 'herbs'
    || MEAT_ITEMS.includes(base) || base === 'chicken_meat' || FISH_ITEMS.includes(base);
}
export function getCookingCapacity(varietyCount: number): number {
  return Math.max(0, Math.min(4, varietyCount)) * 10;
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
    ).slice(0, 3);
  } catch { return []; }
}
export function writePreparedMeals(meals: CookingMeal[]): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(meals.slice(0, 3))); } catch { /* Armazenamento local indisponível. */ }
}
export function getCookingIngredientStacks(inventory: InventoryStack[]): InventoryStack[] {
  return inventory.filter(stack => isCookingIngredient(stack.itemId) && stack.quantity > 0);
}
export function getQuickRecipe(itemId: string, quantity: number): CookingMeal | null {
  if (!Number.isSafeInteger(quantity) || quantity <= 0 || !isCookingIngredient(itemId)) return null;
  const base = getBaseItemId(itemId);
  const rarity = getCookingRarity(itemId);
  const tier = RARITY_STATS[rarity];
  const scale = quantity / 10;
  const effects: CookingEffects = {};
  let name = '';
  let icon = '';
  if (MEAT_ITEMS.includes(base)) {
    name = 'Carne grelhada'; icon = '🥩';
    effects.forca = tier.damage * scale; effects.destreza = tier.damage * scale;
  } else if (base === 'chicken_meat') {
    name = 'Frango grelhado'; icon = '🍗'; effects.inteligencia = tier.damage * scale;
  } else if (FISH_ITEMS.includes(base)) {
    name = 'Peixe grelhado'; icon = '🐟'; effects.velocidadeAtaque = tier.utility * scale;
  } else if (base === 'cabbage') {
    name = 'Sopa de repolho'; icon = '🥬'; effects.velocidadeMovimento = tier.utility * scale;
  } else if (base === 'tomato') {
    name = 'Sopa de tomate'; icon = '🍅'; effects.healingPerSecond = RARITY_HEAL[rarity] * scale;
  } else return null;
  return {
    id: 'quick-' + Date.now() + '-' + base, slot: 'quick', name, icon, rarity,
    effects, ingredients: [{ itemId, quantity }], durationSeconds: QUICK_MEAL_SECONDS,
  };
}
export function getPanMeal(ingredients: Array<{ itemId: string; quantity: number }>): CookingMeal | null {
  if (ingredients.length < 1 || ingredients.length > 4
    || ingredients.some(item => !isCookingIngredient(item.itemId) || !Number.isSafeInteger(item.quantity) || item.quantity <= 0)) return null;
  const totalUnits = ingredients.reduce((sum, item) => sum + item.quantity, 0);
  const varietyCount = new Set(ingredients.map(item => getBaseItemId(item.itemId))).size;
  if (varietyCount !== ingredients.length || totalUnits < 10 || totalUnits > getCookingCapacity(varietyCount)
    || ingredients.every(item => getBaseItemId(item.itemId) === 'herbs')) return null;
  const rarity = getCookingRarity(ingredients[0].itemId);
  if (ingredients.some(item => getCookingRarity(item.itemId) !== rarity)) return null;

  const bonusIngredients = ingredients.filter(item => getBaseItemId(item.itemId) !== 'herbs');
  const divisor = bonusIngredients.length;
  const effects: CookingEffects = {};
  const caps: CookingEffects = {};
  for (const item of bonusIngredients) {
    const meal = getQuickRecipe(item.itemId, item.quantity);
    const baseline = getQuickRecipe(item.itemId, 10);
    if (!meal || !baseline) continue;
    for (const [key, value] of Object.entries(meal.effects) as Array<[keyof CookingEffects, number]>) {
      effects[key] = (effects[key] ?? 0) + value / divisor;
    }
    for (const [key, value] of Object.entries(baseline.effects) as Array<[keyof CookingEffects, number]>) {
      caps[key] = Math.max(caps[key] ?? 0, value);
    }
  }
  for (const key of Object.keys(effects) as Array<keyof CookingEffects>) {
    effects[key] = Math.min(effects[key]!, caps[key] ?? effects[key]!);
  }

  const herbs = ingredients.find(item => getBaseItemId(item.itemId) === 'herbs');
  const durationSeconds = QUICK_MEAL_SECONDS + (herbs ? HERB_MINUTES_PER_UNIT[rarity] * herbs.quantity * 60 : 0);
  const bases = bonusIngredients.map(item => getBaseItemId(item.itemId));
  const proteins = bases.filter(base => FISH_ITEMS.includes(base) || MEAT_ITEMS.includes(base) || base === 'chicken_meat');
  const vegetables = bases.filter(base => base === 'tomato' || base === 'cabbage');
  const protein = proteins[0];
  const sauce = vegetables.length > 1 ? 'mixed' : vegetables[0];
  const single = divisor === 1 ? getQuickRecipe(bonusIngredients[0].itemId, 10) : null;

  let name = single?.name ?? 'Sopa mista';
  let icon = single?.icon ?? '🥣';
  if (!single && protein) {
    const proteinName = FISH_ITEMS.includes(protein) ? 'peixe'
      : protein === 'chicken_meat' ? 'frango' : 'carne';
    const sauceName = sauce === 'tomato' ? 'ao tomate'
      : sauce === 'cabbage' ? 'com repolho'
        : sauce === 'mixed' ? 'com molho misto' : '';
    name = proteins.length > 1
      ? (sauceName ? 'Ensopado misto ' + sauceName : 'Ensopado misto')
      : 'Ensopado de ' + proteinName + (sauceName ? ' ' + sauceName : '');
    icon = sauce === 'tomato' ? '🍲🍅' : sauce === 'cabbage' ? '🍲🥬'
      : sauce === 'mixed' ? '🍲🍅🥬' : '🍲';
  } else if (!single && vegetables.length > 1) {
    name = 'Sopa mista de tomate e repolho';
    icon = '🥣🍅🥬';
  }

  return {
    id: 'cooking-' + Date.now(), slot: divisor === 1 ? 'quick' : 'pan',
    name, icon, rarity, effects, ingredients: ingredients.map(item => ({ ...item })),
    durationSeconds, herbExtended: !!herbs,
  };
}
export function consumeCookingIngredients(inventory: InventoryStack[], meal: CookingMeal): InventoryStack[] | null {
  const next = inventory.map(stack => ({ ...stack }));
  for (const ingredient of meal.ingredients) {
    let remaining = ingredient.quantity;
    for (let i = next.length - 1; i >= 0 && remaining > 0; i--) {
      if (next[i].itemId !== ingredient.itemId) continue;
      const used = Math.min(remaining, next[i].quantity);
      next[i].quantity -= used; remaining -= used;
      if (next[i].quantity <= 0) next.splice(i, 1);
    }
    if (remaining > 0) return null;
  }
  return next;
}
export const COOKING_DURATION_SECONDS = QUICK_MEAL_SECONDS;
export const COOKING_RARITY_TIER = RARITY_INDEX;
