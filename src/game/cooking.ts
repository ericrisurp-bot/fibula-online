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
  productionStartedAt?: number;
  productionReadyAt?: number;
};
export type ActiveCookingMeal = CookingMeal & { remainingSeconds: number };

const STORAGE_KEY = 'fibula-prepared-meals';
const READY_STORAGE_KEY = 'fibula-ready-meals';
export const COOKING_PRODUCTION_MS = 30 * 60 * 1000;
const RARITY_INDEX: Record<ItemRarity | 'normal', number> = { normal: 0, common: 1, uncommon: 2, rare: 3, legendary: 4 };
const RARITY_STATS = {
  normal: { damage: 6, utility: 3 }, common: { damage: 12, utility: 6 },
  uncommon: { damage: 18, utility: 9 }, rare: { damage: 24, utility: 12 },
  legendary: { damage: 30, utility: 15 },
} as const;
const RARITY_HEAL = { normal: 0.5, common: 1, uncommon: 1.5, rare: 2, legendary: 2.5 } as const;
const HERB_MINUTES_PER_UNIT = { normal: 2, common: 4, uncommon: 6, rare: 8, legendary: 10 } as const;
const FISH_ITEMS = ['tilapia', 'tambaqui', 'pintado_surubim', 'lambari', 'tucunare'];
export const FISH_RARITY: Record<string, ItemRarity | 'normal'> = {
  tilapia: 'normal', tambaqui: 'common', pintado_surubim: 'uncommon',
  lambari: 'rare', tucunare: 'legendary',
};
const MEAT_ITEMS = ['wolf_meat'];
const QUICK_MEAL_SECONDS = 30 * 60;

export function getCookingRarity(itemId: string): ItemRarity | 'normal' {
  const base = getBaseItemId(itemId);
  if (FISH_ITEMS.includes(base)) return FISH_RARITY[base] ?? 'normal';
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
function isStoredCookingMeal(meal: unknown): meal is CookingMeal {
  return !!meal && typeof meal === 'object'
    && ((meal as CookingMeal).slot === 'quick' || (meal as CookingMeal).slot === 'pan')
    && typeof (meal as CookingMeal).id === 'string'
    && typeof (meal as CookingMeal).name === 'string'
    && typeof (meal as CookingMeal).icon === 'string'
    && Array.isArray((meal as CookingMeal).ingredients)
    && !!(meal as CookingMeal).effects && typeof (meal as CookingMeal).effects === 'object';
}
function readCookingStorage(key: string): CookingMeal[] {
  if (typeof window === 'undefined') return [];
  try {
    const saved: unknown = JSON.parse(window.localStorage.getItem(key) ?? '[]');
    if (!Array.isArray(saved)) return [];
    return saved.filter(isStoredCookingMeal).map(meal => ({
      ...meal,
      // Receitas antigas, preparadas antes da fila de produção, são tratadas como prontas.
      productionStartedAt: Number.isFinite(meal.productionStartedAt) ? meal.productionStartedAt : 0,
      productionReadyAt: Number.isFinite(meal.productionReadyAt) ? meal.productionReadyAt : 0,
    }));
  } catch { return []; }
}
export function readPreparedMeals(): CookingMeal[] {
  return readCookingStorage(STORAGE_KEY).slice(0, 3);
}
export function writePreparedMeals(meals: CookingMeal[]): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(meals.slice(0, 3))); } catch { /* Armazenamento local indisponível. */ }
}
export function readReadyMeals(): CookingMeal[] {
  return readCookingStorage(READY_STORAGE_KEY);
}
export function writeReadyMeals(meals: CookingMeal[]): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(READY_STORAGE_KEY, JSON.stringify(meals)); } catch { /* Armazenamento local indisponível. */ }
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
export function getPanMealError(ingredients: Array<{ itemId: string; quantity: number }>): string | null {
  if (ingredients.length < 1 || ingredients.length > 4
    || ingredients.some(item => !isCookingIngredient(item.itemId) || !Number.isSafeInteger(item.quantity) || item.quantity <= 0)) {
    return 'Escolha de 1 a 4 ingredientes.';
  }
  const bases = ingredients.map(item => getBaseItemId(item.itemId));
  const varietyCount = new Set(bases).size;
  if (varietyCount !== ingredients.length) {
    return 'Use no máximo uma unidade de cada tipo de ingrediente por espaço.';
  }
  const totalUnits = ingredients.reduce((sum, item) => sum + item.quantity, 0);
  if (totalUnits < 10) return 'Use pelo menos 10 unidades no total.';
  const capacity = getCookingCapacity(varietyCount);
  if (totalUnits > capacity) return 'Esta receita aceita no máximo ' + capacity + ' unidades.';
  if (bases.every(base => base === 'herbs')) return 'Só ervas não faz uma receita.';
  const fishTypes = new Set(bases.filter(base => FISH_ITEMS.includes(base)));
  if (fishTypes.size > 1) return 'Dois tipos de peixe não podem ser combinados.';
  const rarity = getCookingRarity(ingredients[0].itemId);
  if (ingredients.some(item => getCookingRarity(item.itemId) !== rarity)) {
    return 'Não misture raridades diferentes. Cada peixe tem a sua raridade.';
  }
  return null;
}

export function getPanMeal(ingredients: Array<{ itemId: string; quantity: number }>): CookingMeal | null {
  if (getPanMealError(ingredients) !== null) return null;
  const rarity = getCookingRarity(ingredients[0].itemId);
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
    const stewName = protein === 'wolf_meat' ? 'Guisado de carne' : 'Ensopado de ' + proteinName;
    name = proteins.length > 1
      ? (sauceName ? 'Ensopado misto ' + sauceName : 'Ensopado misto')
      : stewName + (sauceName ? ' ' + sauceName : '');
    icon = sauce === 'tomato' ? '🍲🍅' : sauce === 'cabbage' ? '🍲🥬'
      : sauce === 'mixed' ? '🍲🍅🥬' : '🍲';
  } else if (!single && vegetables.length > 1) {
    name = 'Sopa de tomate e repolho';
    icon = '🥣🍅🥬';
  }

  return {
    id: 'cooking-' + Date.now(), slot: bonusIngredients.length === 1 ? 'quick' : 'pan',
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
