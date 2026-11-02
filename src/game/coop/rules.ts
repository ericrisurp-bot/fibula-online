import { soloHordeTarget } from '../horde';

// Mantido apenas para exibição/documentação; o cálculo usa as constantes inteiras abaixo.
export const DUO_HORDE_MULTIPLIER = 1.7 as const;
export const DUO_HORDE_MULTIPLIER_NUMERATOR = 17 as const;
export const DUO_HORDE_MULTIPLIER_DENOMINATOR = 10 as const;
export const DUO_PLAYER_COUNT = 2 as const;

export type DuoHordeAllocation = {
  userId: string;
  enemyCount: number;
};

export type DuoHordePressure = {
  soloEnemyTarget: number;
  multiplier: typeof DUO_HORDE_MULTIPLIER;
  totalEnemyTarget: number;
  allocations: DuoHordeAllocation[];
};

export type DuoNightParticipantState = {
  userId: string;
  alive: boolean;
  nightComplete: boolean;
};

function assertSoloEnemyTarget(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError('A quantidade de inimigos do Solo deve ser um inteiro seguro não negativo.');
  }
  if (value > Math.floor(Number.MAX_SAFE_INTEGER / DUO_HORDE_MULTIPLIER_NUMERATOR)) {
    throw new RangeError('A quantidade de inimigos do Solo excede o limite seguro para o cálculo cooperativo.');
  }
}

/**
 * Calculates the total cooperative horde from the current Solo target.
 * Espelhado no servidor como floor((solo*17+5)/10). Nunca usar ponto flutuante.
 */
export function calculateDuoHordePressure(soloEnemyTarget: number): number {
  assertSoloEnemyTarget(soloEnemyTarget);
  return Math.floor((
    soloEnemyTarget * DUO_HORDE_MULTIPLIER_NUMERATOR
    + DUO_HORDE_MULTIPLIER_DENOMINATOR / 2
  ) / DUO_HORDE_MULTIPLIER_DENOMINATOR);
}

/** Obtém o alvo cooperativo da noite a partir da fonte única do Solo. */
export function duoHordeTotalForNight(nightNumber: number): number {
  return calculateDuoHordePressure(soloHordeTarget(nightNumber));
}

/**
 * Splits the full 1.7x pressure between the living players.
 * The stable participant order receives any remainder (17 -> 9 + 8).
 * A single survivor receives the entire total; dead players receive zero.
 */
export function allocateDuoHordePressure(
  soloEnemyTarget: number,
  participantIds: readonly [string, string],
  alivePlayerIds: readonly string[],
): DuoHordePressure {
  assertSoloEnemyTarget(soloEnemyTarget);
  const [firstId, secondId] = participantIds;
  if (!firstId || !secondId || firstId === secondId) {
    throw new Error('A sessão Duo precisa ter dois participantes distintos.');
  }

  const alive = new Set(alivePlayerIds);
  const livingIds = participantIds.filter(userId => alive.has(userId));
  const totalEnemyTarget = calculateDuoHordePressure(soloEnemyTarget);

  if (livingIds.length === 0) {
    return {
      soloEnemyTarget,
      multiplier: DUO_HORDE_MULTIPLIER,
      totalEnemyTarget,
      allocations: [],
    };
  }

  const baseShare = Math.floor(totalEnemyTarget / livingIds.length);
  const remainder = totalEnemyTarget % livingIds.length;

  return {
    soloEnemyTarget,
    multiplier: DUO_HORDE_MULTIPLIER,
    totalEnemyTarget,
    allocations: livingIds.map((userId, index) => ({
      userId,
      enemyCount: baseShare + (index < remainder ? 1 : 0),
    })),
  };
}

/**
 * A night can advance once every living participant has cleared their own
 * horde. A dead participant is resolved, but a fully defeated duo ends the
 * session instead of advancing to another night.
 */
export function canAdvanceDuoNight(
  participants: readonly DuoNightParticipantState[],
): boolean {
  return participants.length === DUO_PLAYER_COUNT
    && new Set(participants.map(participant => participant.userId)).size === DUO_PLAYER_COUNT
    && participants.some(participant => participant.alive)
    && participants.every(participant => !participant.alive || participant.nightComplete);
}

/** Creates a reproducible but player-specific world seed from the shared match seed. */
export function deriveDuoPlayerSeed(matchSeed: number, userId: string): number {
  if (!Number.isSafeInteger(matchSeed) || matchSeed < 0) {
    throw new RangeError('A seed da partida deve ser um inteiro seguro não negativo.');
  }
  if (!userId.trim()) throw new Error('O ID do jogador é obrigatório para derivar a seed individual.');

  let hash = (2166136261 ^ (matchSeed >>> 0)) >>> 0;
  for (let index = 0; index < userId.length; index++) {
    hash ^= userId.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash || 0x6d2b79f5;
}
