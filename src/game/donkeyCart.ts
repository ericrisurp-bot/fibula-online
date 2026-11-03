import { getBaseItemId, type InventoryStack } from './inventory';

/** O burrinho e a carroça formam uma única entidade do mundo. */
export type DonkeyCartStage = 'broken' | 'built';

export type DonkeyCartState = {
  x: number;
  y: number;
  /** Posição própria da entidade burrinho no mundo. */
  donkeyX: number;
  donkeyY: number;
  angle: number;
  stage: DonkeyCartStage;
  /** Vida interna do conjunto; não representa uma barra visual. */
  health: number;
  maxHealth: number;
  /** Diferencia a primeira construção de uma reconstrução após quebrar. */
  everBuilt: boolean;
  carried: boolean;
  inventory: InventoryStack[];
};

export type DonkeyCartConstructionCost = {
  wood: 10;
  cotton: 0 | 5;
};

export type DonkeyCartConstructionResult = {
  built: boolean;
  state: DonkeyCartState;
  inventory: InventoryStack[];
  cost: DonkeyCartConstructionCost;
};

/** Cria o estado inicial: carroça quebrada e burrinho ao lado. */
export function createDonkeyCartState(
  x: number,
  y: number,
  maxHealth: number,
  inventory: InventoryStack[] = [],
): DonkeyCartState {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new RangeError('A posição do conjunto burrinho-carroça deve ser finita.');
  }
  if (!Number.isFinite(maxHealth) || maxHealth <= 0) {
    throw new RangeError('A vida máxima do conjunto deve ser positiva.');
  }
  return {
    x,
    y,
    donkeyX: x - 68,
    donkeyY: y,
    angle: 0,
    stage: 'broken',
    health: 0,
    maxHealth,
    everBuilt: false,
    carried: false,
    inventory: inventory.map(stack => ({ ...stack })),
  };
}

/** Custo da transição para o estado construído. */
export function getDonkeyCartConstructionCost(state: DonkeyCartState): DonkeyCartConstructionCost {
  return { wood: 10, cotton: state.everBuilt ? 5 : 0 };
}

function countBaseItem(inventory: InventoryStack[], itemId: string): number {
  return inventory.reduce(
    (total, stack) => total + (getBaseItemId(stack.itemId) === itemId ? stack.quantity : 0),
    0,
  );
}

function consumeBaseItem(inventory: InventoryStack[], itemId: string, requested: number): InventoryStack[] {
  let remaining = requested;
  return inventory.flatMap(stack => {
    if (getBaseItemId(stack.itemId) !== itemId || remaining <= 0) return [{ ...stack }];
    const used = Math.min(stack.quantity, remaining);
    remaining -= used;
    const left = stack.quantity - used;
    return left > 0 ? [{ ...stack, quantity: left }] : [];
  });
}

/**
 * Constrói ou reconstrói o conjunto de forma atômica.
 * A primeira construção custa 10 madeiras; reconstruções custam 10 madeiras e 5 algodões.
 */
export function constructDonkeyCart(
  state: DonkeyCartState,
  inventory: InventoryStack[],
): DonkeyCartConstructionResult {
  const cost = getDonkeyCartConstructionCost(state);
  const unchanged = (): DonkeyCartConstructionResult => ({
    built: false,
    state: { ...state, inventory: state.inventory.map(stack => ({ ...stack })) },
    inventory: inventory.map(stack => ({ ...stack })),
    cost,
  });

  if (state.stage === 'built') return unchanged();
  if (countBaseItem(inventory, 'wood') < cost.wood) return unchanged();
  if (countBaseItem(inventory, 'cotton') < cost.cotton) return unchanged();

  let remaining = inventory.map(stack => ({ ...stack }));
  remaining = consumeBaseItem(remaining, 'wood', cost.wood);
  if (cost.cotton > 0) remaining = consumeBaseItem(remaining, 'cotton', cost.cotton);

  return {
    built: true,
    state: {
      ...state,
      stage: 'built',
      health: state.maxHealth,
      everBuilt: true,
      carried: false,
      inventory: state.inventory.map(stack => ({ ...stack })),
    },
    inventory: remaining,
    cost,
  };
}

/** Aplica dano ao conjunto; ao zerar a vida, volta diretamente ao estado quebrado. */
export function damageDonkeyCart(state: DonkeyCartState, damage: number): DonkeyCartState {
  if (state.stage !== 'built' || !Number.isFinite(damage) || damage <= 0) {
    return { ...state, inventory: state.inventory.map(stack => ({ ...stack })) };
  }

  const health = Math.max(0, state.health - damage);
  if (health > 0) return { ...state, health };

  return {
    ...state,
    stage: 'broken',
    health: 0,
    carried: false,
  };
}
