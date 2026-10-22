/**
 * Sistema universal de atributos do Fíbula Online.
 *
 * A base fixa não recebe multiplicadores. Cada nível/onda soma apenas o
 * incremento novo multiplicado pelo perfil atual; ganhos antigos não mudam.
 */
export const ATTRIBUTE_KEYS = [
  'strength',
  'dexterity',
  'intelligence',
  'health',
  'attackSpeed',
  'movementSpeed',
  'armor',
  'magicResistance',
  'dodge',
  'fireResistance',
  'waterResistance',
  'earthResistance',
  'fireDamage',
  'waterDamage',
  'earthDamage',
] as const;

export type AttributeKey = (typeof ATTRIBUTE_KEYS)[number];
export type AttributeValues = Record<AttributeKey, number>;
export type AttributeMultipliers = Partial<Record<AttributeKey, number>>;
export type ProgressionSource = 'level' | 'wave';

export type AttributeState = {
  base: AttributeValues;
  gained: AttributeValues;
  multipliers: AttributeMultipliers;
};

export type ElementalScaling = {
  strengthMultiplier: number;
  intelligenceMultiplier: number;
};

/** Cria atributos com base fixa e ganhos acumulados separados. */
export function createAttributeState(
  fixedBase: Partial<AttributeValues>,
  multipliers: AttributeMultipliers = {},
): AttributeState {
  return {
    base: completeValues(fixedBase),
    gained: completeValues({}),
    multipliers: { ...multipliers },
  };
}

/** Soma somente os ganhos novos; não recalcula base nem histórico. */
export function applyAttributeProgression(
  state: AttributeState,
  baseIncrement: Partial<AttributeValues>,
  _source: ProgressionSource,
): AttributeState {
  const gained = { ...state.gained };
  for (const key of ATTRIBUTE_KEYS) {
    const increment = baseIncrement[key] ?? 0;
    const multiplier = state.multipliers[key] ?? 1;
    if (!Number.isFinite(increment) || increment < 0) {
      throw new RangeError(`O crescimento de "${key}" deve ser finito e não negativo.`);
    }
    if (!Number.isFinite(multiplier) || multiplier < 0) {
      throw new RangeError(`O multiplicador de "${key}" deve ser finito e não negativo.`);
    }
    gained[key] += increment * multiplier;
  }
  return { ...state, gained };
}

export function getAttributeValue(state: AttributeState, key: AttributeKey): number {
  return state.base[key] + state.gained[key];
}

export function getAttributeValues(state: AttributeState): AttributeValues {
  return Object.fromEntries(
    ATTRIBUTE_KEYS.map(key => [key, getAttributeValue(state, key)]),
  ) as AttributeValues;
}

/**
 * Dano elemental preparado para equipamento/skills:
 * base do item + Força x multiplicador + Inteligência x multiplicador.
 * Os multiplicadores são explícitos e não representam balanceamento definido.
 */
export function calculateElementalDamage(
  baseDamage: number,
  strength: number,
  intelligence: number,
  scaling: ElementalScaling,
): number {
  const inputs = [baseDamage, strength, intelligence, scaling.strengthMultiplier, scaling.intelligenceMultiplier];
  if (inputs.some(value => !Number.isFinite(value) || value < 0)) {
    throw new RangeError('Dano, atributos e multiplicadores elementais devem ser finitos e não negativos.');
  }
  return baseDamage + strength * scaling.strengthMultiplier + intelligence * scaling.intelligenceMultiplier;
}

function completeValues(values: Partial<AttributeValues>): AttributeValues {
  return Object.fromEntries(
    ATTRIBUTE_KEYS.map(key => {
      const value = values[key] ?? 0;
      if (!Number.isFinite(value) || value < 0) {
        throw new RangeError(`O valor inicial de "${key}" deve ser finito e não negativo.`);
      }
      return [key, value];
    }),
  ) as AttributeValues;
}
