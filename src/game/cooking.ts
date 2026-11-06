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

export const COOKING_PRODUCTION_MS = 30 * 60 * 1000;

type CookingRpcClient = unknown;
export type CookingServerState = {
  now_ms: number;
  prepared: CookingMeal[];
  ready: CookingMeal[];
  pending: CookingMeal[];
};
export type CookingPendingResult = { now_ms: number; meals: CookingMeal[] };
export type CookingConsumeResult = CookingServerState & { meal: CookingMeal };

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

function isStoredCookingMeal(meal: unknown): meal is CookingMeal {
  if (!meal || typeof meal !== 'object' || Array.isArray(meal)) return false;
  const value = meal as Record<string, unknown>;
  return (value.slot === 'quick' || value.slot === 'pan')
    && typeof value.id === 'string' && value.id.length > 0
    && typeof value.name === 'string' && typeof value.icon === 'string'
    && (typeof value.rarity === 'string')
    && Array.isArray(value.ingredients)
    && value.ingredients.every(item => !!item && typeof item === 'object'
      && typeof (item as Record<string, unknown>).itemId === 'string'
      && Number.isSafeInteger((item as Record<string, unknown>).quantity)
      && ((item as Record<string, unknown>).quantity as number) > 0)
    && !!value.effects && typeof value.effects === 'object' && !Array.isArray(value.effects);
}
function invalidCookingResponse(detail: string): Error {
  return new Error('O servidor retornou dados inválidos para a cozinha: ' + detail);
}
function readCookingObject(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw invalidCookingResponse('resposta não é um objeto.');
  return data as Record<string, unknown>;
}
function readCookingClock(payload: Record<string, unknown>): number {
  if (typeof payload.now_ms !== 'number' || !Number.isFinite(payload.now_ms)) {
    throw invalidCookingResponse('o relógio do servidor está ausente ou inválido.');
  }
  return payload.now_ms;
}
function readCookingMeals(payload: Record<string, unknown>, key: 'prepared' | 'ready' | 'pending'): CookingMeal[] {
  const value = payload[key];
  if (!Array.isArray(value) || !value.every(isStoredCookingMeal)) {
    throw invalidCookingResponse('a lista "' + key + '" está ausente ou contém refeições inválidas.');
  }
  return value as CookingMeal[];
}
function readCookingState(data: unknown): CookingServerState {
  const payload = readCookingObject(data);
  return {
    now_ms: readCookingClock(payload),
    prepared: readCookingMeals(payload, 'prepared'),
    ready: readCookingMeals(payload, 'ready'),
    pending: readCookingMeals(payload, 'pending'),
  };
}
async function callCookingRpc(client: CookingRpcClient, name: string, args?: Record<string, unknown>): Promise<unknown> {
  const rpcClient = client as { rpc: (rpcName: string, rpcArgs?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message?: string } | null }> };
  const { data, error } = await rpcClient.rpc(name, args);
  if (error) throw new Error(error.message || 'O servidor recusou a operação de cozinha.');
  return data;
}
export async function getCookingServerState(client: CookingRpcClient): Promise<CookingServerState> {
  return readCookingState(await callCookingRpc(client, 'fibula_cooking_get'));
}
export async function startCookingProduction(client: CookingRpcClient, meal: CookingMeal): Promise<CookingServerState> {
  return readCookingState(await callCookingRpc(client, 'fibula_cooking_start', { p_meal: meal }));
}
export async function collectCookingMeal(client: CookingRpcClient, mealId: string): Promise<CookingServerState> {
  return readCookingState(await callCookingRpc(client, 'fibula_cooking_collect', { p_meal_id: mealId }));
}
export async function queueCookingMeal(client: CookingRpcClient, mealId: string): Promise<CookingServerState> {
  return readCookingState(await callCookingRpc(client, 'fibula_cooking_queue', { p_meal_id: mealId }));
}
export async function returnCookingMeal(client: CookingRpcClient, mealId: string): Promise<CookingServerState> {
  return readCookingState(await callCookingRpc(client, 'fibula_cooking_return', { p_meal_id: mealId }));
}
export async function consumeReadyCookingMeal(client: CookingRpcClient, mealId: string): Promise<CookingConsumeResult> {
  const payload = readCookingObject(await callCookingRpc(client, 'fibula_cooking_consume_ready', { p_meal_id: mealId }));
  const state = readCookingState(payload);
  if (!isStoredCookingMeal(payload.meal)) throw invalidCookingResponse('a refeição consumida está ausente ou inválida.');
  return { ...state, meal: payload.meal };
}
export async function takePendingCookingMeals(client: CookingRpcClient): Promise<CookingPendingResult> {
  const payload = readCookingObject(await callCookingRpc(client, 'fibula_cooking_take_pending'));
  const meals = payload.meals;
  if (!Array.isArray(meals) || !meals.every(isStoredCookingMeal)) {
    throw invalidCookingResponse('a lista de refeições pendentes está ausente ou contém refeições inválidas.');
  }
  return { now_ms: readCookingClock(payload), meals: meals as CookingMeal[] };
}
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
  if (ingredients.length > 4) return 'A receita aceita no máximo 4 ingredientes diferentes.';
  if (ingredients.length === 0) return 'Escolha pelo menos um ingrediente principal.';
  if (ingredients.some(item => !isCookingIngredient(item.itemId)
    || !Number.isSafeInteger(item.quantity) || item.quantity <= 0)) {
    return 'Confira os ingredientes e suas quantidades.';
  }

  const bases = ingredients.map(item => getBaseItemId(item.itemId));
  const principalIngredients = ingredients.filter(item => getBaseItemId(item.itemId) !== 'herbs');
  if (principalIngredients.length === 0) return 'Só ervas não formam uma receita. Adicione um ingrediente principal.';

  const varietyCount = new Set(bases).size;
  if (varietyCount !== ingredients.length) {
    return 'Use apenas uma entrada de cada tipo de ingrediente na receita.';
  }

  const totalUnits = ingredients.reduce((sum, item) => sum + item.quantity, 0);
  if (totalUnits > 40) return 'A receita aceita no máximo 40 unidades.';
  if (totalUnits < 10) return 'Use pelo menos 10 unidades no total.';

  const fishTypes = new Set(bases.filter(base => FISH_ITEMS.includes(base)));
  if (fishTypes.size > 1) return 'Duas espécies diferentes de peixe não podem ser misturadas na mesma receita.';

  const rarity = getCookingRarity(principalIngredients[0].itemId);
  if (principalIngredients.some(item => getCookingRarity(item.itemId) !== rarity)) {
    return 'Todos os ingredientes principais precisam ter a mesma raridade.';
  }

  const capacity = getCookingCapacity(varietyCount);
  if (totalUnits > capacity) return 'Com esses ingredientes, a receita aceita no máximo ' + capacity + ' unidades.';
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
