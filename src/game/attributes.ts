/**
 * Sistema universal de atributos do Fíbula Online.
 *
 * Regra: o valor fixo inicial fica separado dos ganhos de progressão.
 * Multiplicadores afetam somente o ganho novo de cada nível/onda; nunca
 * recalculam a base fixa nem os ganhos já acumulados.
 *
 * Este módulo define a fundação do sistema. A ligação ao motor e os perfis
 * específicos de classe/inimigo serão feitos depois da validação desta etapa.
 */

export const ATTRIBUTE_KEYS = [
  // Atributos comuns
  'health',
  'armor',
  'dodge',
  'movementSpeed',
  'attackSpeed',

  // Combate físico
  'strength',
  'accuracy',
  'rangedDamage',

  // Magia
  'intelligence',
  'magicDamage',

  // Dano elemental (separado do dano mágico)
  'fireDamage',
  'waterDamage',
  'earthDamage',

  // Resistências
  'physicalResistance',
  'magicResistance',
  'fireResistance',
  'waterResistance',
  'earthResistance',
] as const;

export type AttributeKey = (typeof ATTRIBUTE_KEYS)[number];
export type AttributeValues = Record<AttributeKey, number>;

/**
 * Multiplicador de progressão por atributo.
 * A ausência de um valor significa 1x, sem escolher multiplicadores de classe.
 */
export type AttributeMultipliers = Partial<Record<AttributeKey, number>>;

/** Estado por personagem/inimigo: base fixa e ganhos progressivos separados. */
export type AttributeState = {
  base: AttributeValues;
  gained: AttributeValues;
  multipliers: AttributeMultipliers;
};

export type ProgressionSource = 'level' | 'wave';

/** Cria uma ficha com valores iniciais fixos, sem aplicar multiplicadores à base. */
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

/**
 * Adiciona o crescimento de um nível ou onda.
 * O valor-base é o incremento novo; o multiplicador não toca no histórico.
 */
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
      throw new RangeError(`O crescimento de "${key}" deve ser um número finito não negativo.`);
    }
    if (!Number.isFinite(multiplier) || multiplier < 0) {
      throw new RangeError(`O multiplicador de "${key}" deve ser um número finito não negativo.`);
    }

    gained[key] += increment * multiplier;
  }

  return { ...state, gained };
}

/** Valor do atributo sem equipamentos: base fixa + progressão acumulada. */
export function getAttributeValue(state: AttributeState, key: AttributeKey): number {
  return state.base[key] + state.gained[key];
}

/** Calcula a ficha efetiva para leitura, preservando a separação base/ganhos. */
export function getAttributeValues(state: AttributeState): AttributeValues {
  return Object.fromEntries(
    ATTRIBUTE_KEYS.map(key => [key, getAttributeValue(state, key)]),
  ) as AttributeValues;
}

function completeValues(values: Partial<AttributeValues>): AttributeValues {
  return Object.fromEntries(
    ATTRIBUTE_KEYS.map(key => {
      const value = values[key] ?? 0;
      if (!Number.isFinite(value) || value < 0) {
        throw new RangeError(`O valor inicial de "${key}" deve ser um número finito não negativo.`);
      }
      return [key, value];
    }),
  ) as AttributeValues;
}
