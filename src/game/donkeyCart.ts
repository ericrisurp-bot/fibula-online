import { getBaseItemId, type InventoryStack } from './inventory';

/** O burrinho e a carroça formam uma única entidade do mundo. */
export type DonkeyCartStage = 'broken' | 'built';

export type DonkeyCartState = {
  x: number;
  y: number;
  angle: number;
  /** Último lado horizontal escolhido pelo jogador; persiste durante movimento vertical. */
  facingLeft: boolean;
  /** Fase acumulada das rodas, baseada na distância real percorrida. */
  wheelPhase: number;
  /** Quando falso, o conjunto fica parado até o jogador ordenar que siga. */
  following: boolean;
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
  wood: number;
  cotton: number;
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
    angle: Math.PI,
    facingLeft: false,
    wheelPhase: 0,
    following: true,
    stage: 'broken',
    health: 0,
    maxHealth,
    everBuilt: false,
    carried: false,
    inventory: inventory.map(stack => ({ ...stack })),
  };
}

/** Custo da transição para o estado construído. */
export function getDonkeyCartConstructionCost(_state: DonkeyCartState): DonkeyCartConstructionCost {
  return { wood: 1, cotton: 0 };
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
 * O conserto custa 1 madeira.
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
      following: true,
      everBuilt: true,
      carried: false,
      inventory: state.inventory.map(stack => ({ ...stack })),
    },
    inventory: remaining,
    cost,
  };
}

/** Cada impacto de slime remove exatamente 1 ponto de vida do conjunto. */
export function damageDonkeyCart(state: DonkeyCartState): DonkeyCartState {
  if (state.stage !== 'built') {
    return { ...state, inventory: state.inventory.map(stack => ({ ...stack })) };
  }

  const health = Math.max(0, state.health - 1);
  if (health > 0) return { ...state, health };

  return {
    ...state,
    stage: 'broken',
    health: 0,
    following: false,
    carried: false,
  };
}

/** Posição do burrinho derivada da pose única do conjunto; nunca é simulada separadamente. */
export function getDonkeyCartDonkeyPosition(
  state: Pick<DonkeyCartState, 'x' | 'y' | 'angle'>,
  distance: number,
): { x: number; y: number } {
  return {
    x: state.x + Math.cos(state.angle) * distance,
    y: state.y + Math.sin(state.angle) * distance,
  };
}

/** Peças de colisão internas de um único corpo rígido; nenhuma delas tem estado próprio. */
export type DonkeyCartAssemblyCollisionPart = {
  x: number;
  y: number;
  radius: number;
};

/**
 * Descreve a área ocupada pelo conjunto a partir de uma única pose.
 * Os círculos são apenas a forma composta do colisor, não entidades simuladas.
 */
export function getDonkeyCartAssemblyCollisionParts(
  pose: Pick<DonkeyCartState, 'x' | 'y' | 'angle'>,
  donkeyDistance: number,
  donkeyRadius: number,
  cartRadius: number,
): DonkeyCartAssemblyCollisionPart[] {
  const donkey = getDonkeyCartDonkeyPosition(pose, donkeyDistance);
  return [
    { x: pose.x, y: pose.y, radius: cartRadius },
    { x: donkey.x, y: donkey.y, radius: donkeyRadius },
  ];
}
